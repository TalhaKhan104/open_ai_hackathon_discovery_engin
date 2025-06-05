import { DiscoveryAgent, DiscoveryAgentConfig, AgentMessage } from './Agent';
import { DiscoveryManager, Discovery } from './Discovery';
import { tool } from '@openai/agents';
import { z } from 'zod';

export interface ResearchTopic {
  id: string;
  topic: string;
  priority: number; // 1-10 scale
  assignedTo?: string;
  status: 'pending' | 'active' | 'completed';
  parentDiscoveryId?: string;
}

export class ResearchDirectorAgent extends DiscoveryAgent {
  private discoveryManager: DiscoveryManager;
  private researchQueue: ResearchTopic[] = [];
  private currentCycle: number = 0;

  constructor(discoveryManager: DiscoveryManager) {
    const config: DiscoveryAgentConfig = {
      name: 'Research Director',
      role: 'Research Coordination',
      instructions: `You are the Research Director for an ambient discovery system. Your role is to:
        1. Analyze previous discoveries and identify promising research directions
        2. Generate high-priority research topics that build on existing findings
        3. Coordinate research efforts across multiple specialist agents
        4. Prioritize novel, breakthrough potential topics over incremental research
        5. Ensure research compounding by connecting discoveries to form chains
        
        Always think strategically about maximizing novelty discovery potential.
        
        When given research context, respond with JSON in this format:
        {
          "topics": [
            {
              "topic": "specific research topic description",
              "priority": 1-10,
              "parentDiscoveryId": "optional parent discovery ID"
            }
          ]
        }`,
      model: 'gpt-4o-mini',
      temperature: 0.3, // Lower temperature for strategic decisions
      maxTokens: 800,
      tools: [
        tool({
          name: 'analyze_discoveries',
          description: 'Analyze recent discoveries to generate new research topics',
          parameters: z.object({
            discoveries: z.array(z.string()),
            seedDiscoveries: z.array(z.string())
          }),
          execute: async ({ discoveries, seedDiscoveries }) => {
            return `Analyzed ${discoveries.length} recent discoveries and ${seedDiscoveries.length} seed discoveries`;
          }
        })
      ]
    };

    super(config);
    this.discoveryManager = discoveryManager;
  }

  async initialize(): Promise<void> {
    await super.initialize();
    console.log(`🤖 ${this.config.name}: Initializing research coordination system...`);
    
    // Generate initial research topics
    await this.generateInitialTopics();
  }

  async process(input: any): Promise<AgentMessage> {
    this.currentCycle++;
    
    // Analyze recent discoveries for new research directions
    const recentDiscoveries = this.discoveryManager.getValidatedDiscoveries(5);
    const seedDiscoveries = this.discoveryManager.getSeedDiscoveries();
    
    // Generate new research topics based on discoveries
    const newTopics = await this.generateResearchTopics(recentDiscoveries, seedDiscoveries);
    
    // Update research queue
    this.updateResearchQueue(newTopics);
    
    // Select next research topic
    const nextTopic = this.selectNextResearchTopic();
    
    const message: AgentMessage = {
      id: this.generateMessageId(),
      content: JSON.stringify({
        action: 'research_direction',
        topic: nextTopic,
        cycle: this.currentCycle,
        queueLength: this.researchQueue.length,
        buildsOn: nextTopic?.parentDiscoveryId ? [nextTopic.parentDiscoveryId] : []
      }),
      timestamp: new Date(),
      agentName: this.config.name,
      type: 'coordination'
    };

    console.log(`🎯 ${this.config.name}: Directing research cycle ${this.currentCycle} - "${nextTopic?.topic}"`);
    
    return message;
  }

  getStatus(): string {
    return `Active - Cycle ${this.currentCycle}, Queue: ${this.researchQueue.length} topics`;
  }

  private async generateInitialTopics(): Promise<void> {
    const initialPrompt = `Generate 5 high-potential research topics for discovering novel insights. Focus on:
    - Emerging technology intersections
    - Recent scientific breakthroughs
    - Unexplored applications of known technologies
    - Cross-disciplinary connections
    
    Respond with JSON: {"topics": [{"topic": "description", "priority": 1-10}]}`;

    console.log(`🔍 ${this.config.name}: Starting initial topic generation...`);
    
    try {
      console.log(`🔍 ${this.config.name}: Calling OpenAI API with prompt...`);
      const response = await this.runAgent(initialPrompt);
      console.log(`🔍 ${this.config.name}: Received response:`, response);
      
      // Extract the actual JSON text from the OpenAI Agents SDK response
      let jsonText: string;
      if (Array.isArray(response) && response[0]?.content?.[0]?.text) {
        // OpenAI Agents SDK format
        jsonText = response[0].content[0].text;
      } else if (typeof response === 'string') {
        // Direct string response
        jsonText = response;
      } else {
        throw new Error('Unexpected response format');
      }
      
      console.log(`🔍 ${this.config.name}: Extracted JSON text:`, jsonText);
      
      const data = JSON.parse(jsonText);
      console.log(`🔍 ${this.config.name}: Parsed data:`, data);
      
      const topics = data.topics || [];
      console.log(`🔍 ${this.config.name}: Extracted topics:`, topics);
      
      topics.forEach((topic: any, index: number) => {
        const newTopic = {
          id: `initial-${index}`,
          topic: topic.topic,
          priority: topic.priority || 8,
          status: 'pending' as const
        };
        console.log(`🔍 ${this.config.name}: Adding topic:`, newTopic);
        this.researchQueue.push(newTopic);
      });
      
      console.log(`🎯 ${this.config.name}: Generated ${topics.length} initial research topics`);
    } catch (error) {
      console.error(`🔍 ${this.config.name}: Error generating initial topics:`, error);
      console.log(`🔍 ${this.config.name}: Calling fallback topics...`);
      // Fallback topics
      this.addFallbackTopics();
      console.log(`🔍 ${this.config.name}: After fallback, queue length:`, this.researchQueue.length);
    }
  }

  private async generateResearchTopics(recentDiscoveries: Discovery[], seedDiscoveries: Discovery[]): Promise<ResearchTopic[]> {
    if (recentDiscoveries.length === 0 && seedDiscoveries.length === 0) {
      return [];
    }

    const discoveryContext = recentDiscoveries.map(d => 
      `Discovery: "${d.finding}" (Novelty: ${d.noveltyScore}/10)`
    ).join('\n');

    const seedContext = seedDiscoveries.map(d => 
      `Seed: "${d.finding}" (ID: ${d.id})`
    ).join('\n');

    const prompt = `Based on these recent discoveries and high-value seeds, generate 3 follow-up research topics that could lead to novel insights:

Recent Discoveries:
${discoveryContext}

High-Value Seeds:
${seedContext}

Generate topics that:
1. Build on or challenge these discoveries
2. Look for intersections between different discoveries  
3. Explore practical applications or implications
4. Seek contradictory evidence or alternative explanations

Respond with JSON: {"topics": [{"topic": "description", "priority": 1-10, "parentDiscoveryId": "id or null"}]}`;

    try {
      const response = await this.runAgent(prompt);
      
      // Extract the actual JSON text from the OpenAI Agents SDK response
      let jsonText: string;
      if (Array.isArray(response) && response[0]?.content?.[0]?.text) {
        // OpenAI Agents SDK format
        jsonText = response[0].content[0].text;
      } else if (typeof response === 'string') {
        // Direct string response
        jsonText = response;
      } else {
        throw new Error('Unexpected response format');
      }
      
      const data = JSON.parse(jsonText);
      const topicsData = data.topics || [];
      
      return topicsData.map((topic: any, index: number) => ({
        id: `generated-${this.currentCycle}-${index}`,
        topic: topic.topic,
        priority: topic.priority || 7,
        status: 'pending' as const,
        parentDiscoveryId: topic.parentDiscoveryId || undefined
      }));
    } catch (error) {
      console.error(`Error generating research topics:`, error);
      return [];
    }
  }

  private updateResearchQueue(newTopics: ResearchTopic[]): void {
    // Add new topics
    this.researchQueue.push(...newTopics);
    
    // Remove completed topics and sort by priority
    this.researchQueue = this.researchQueue
      .filter(topic => topic.status !== 'completed')
      .sort((a, b) => b.priority - a.priority);
      
    // Keep queue manageable
    if (this.researchQueue.length > 20) {
      this.researchQueue = this.researchQueue.slice(0, 20);
    }
  }

  private selectNextResearchTopic(): ResearchTopic | null {
    const availableTopics = this.researchQueue.filter(topic => topic.status === 'pending');
    
    if (availableTopics.length === 0) {
      return null;
    }

    // Select highest priority topic
    const selectedTopic = availableTopics[0];
    selectedTopic.status = 'active';
    
    return selectedTopic;
  }

  private addFallbackTopics(): void {
    console.log(`🔍 ${this.config.name}: Starting fallback topic generation...`);
    
    const fallbackTopics = [
      { topic: "Quantum computing applications in biological systems", priority: 9 },
      { topic: "AI-driven materials discovery for sustainable technology", priority: 8 },
      { topic: "Intersection of blockchain and space technology", priority: 7 },
      { topic: "Novel applications of CRISPR beyond gene editing", priority: 8 },
      { topic: "Emergent properties in neural network architectures", priority: 7 }
    ];

    console.log(`🔍 ${this.config.name}: Adding ${fallbackTopics.length} fallback topics...`);

    fallbackTopics.forEach((topic, index) => {
      const newTopic = {
        id: `fallback-${index}`,
        topic: topic.topic,
        priority: topic.priority,
        status: 'pending' as const
      };
      console.log(`🔍 ${this.config.name}: Adding fallback topic:`, newTopic);
      this.researchQueue.push(newTopic);
    });
    
    console.log(`🔍 ${this.config.name}: Fallback complete. Queue length:`, this.researchQueue.length);
  }

  // Public method to handle voice commands
  async processVoiceCommand(command: string): Promise<void> {
    console.log(`🎤 ${this.config.name}: Processing voice command - "${command}"`);
    
    // Extract research topic from voice command
    const topicMatch = command.match(/research\s+(.+)/i);
    if (topicMatch) {
      const userTopic = topicMatch[1];
      
      // Add high-priority user-requested topic
      this.researchQueue.unshift({
        id: `voice-${Date.now()}`,
        topic: userTopic,
        priority: 10, // Highest priority for user requests
        status: 'pending'
      });
      
      console.log(`🎯 ${this.config.name}: Added high-priority topic from voice: "${userTopic}"`);
    }
  }

  getCurrentTopic(): ResearchTopic | null {
    return this.researchQueue.find(topic => topic.status === 'active') || null;
  }

  getQueueStatus(): { pending: number; active: number; total: number } {
    return {
      pending: this.researchQueue.filter(t => t.status === 'pending').length,
      active: this.researchQueue.filter(t => t.status === 'active').length,
      total: this.researchQueue.length
    };
  }
} 