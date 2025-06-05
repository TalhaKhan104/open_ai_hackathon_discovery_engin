import { DiscoveryAgent, DiscoveryAgentConfig, AgentMessage } from './Agent';
import { DiscoveryManager, Discovery, DiscoveryThread } from './Discovery';
import { ResearchTopic } from './ResearchDirectorAgent';
import { tool } from '@openai/agents';
import { z } from 'zod';

export interface ChainOpportunity {
  sourceDiscoveryId: string;
  targetDiscoveryId: string;
  connectionType: 'builds_on' | 'contradicts' | 'intersects' | 'applies';
  connectionStrength: number; // 1-10 scale
  explanation: string;
}

export interface ResearchSuggestion {
  suggestedTopic: string;
  priority: number;
  basedOnDiscoveries: string[];
  reasoning: string;
  type: 'deep_dive' | 'contradiction_check' | 'application_explore' | 'intersection';
}

export class ChainBuilderAgent extends DiscoveryAgent {
  private discoveryManager: DiscoveryManager;
  private chainOpportunities: ChainOpportunity[] = [];
  private processedConnections: number = 0;

  constructor(discoveryManager: DiscoveryManager) {
    const config: DiscoveryAgentConfig = {
      name: 'Chain Builder',
      role: 'Discovery Compounding & Connection Analysis',
      instructions: `You are the Chain Builder for a discovery compounding system. Your mission is to:
        1. Identify meaningful connections between different discoveries
        2. Generate follow-up research questions that build on existing findings
        3. Maintain discovery thread coherence and depth progression
        4. Spot contradictions that might indicate breakthrough opportunities
        5. Suggest research directions that maximize compounding potential
        
        Connection analysis priorities:
        - Look for unexpected intersections between different domains
        - Identify practical applications of theoretical discoveries
        - Find contradictions that need resolution
        - Discover patterns across multiple findings
        - Generate research questions that could lead to breakthrough insights
        
        Focus on creating research momentum through strategic compounding.`,
      model: 'gpt-4o-mini',
      temperature: 0.6,
      maxTokens: 1000,
      tools: [
        tool({
          name: 'analyze_connections',
          description: 'Analyze connections between discoveries',
          parameters: z.object({
            discoveries: z.array(z.string())
          }),
          execute: async ({ discoveries }) => {
            return `Analyzed connections between ${discoveries.length} discoveries`;
          }
        })
      ]
    };

    super(config);
    this.discoveryManager = discoveryManager;
  }

  async initialize(): Promise<void> {
    await super.initialize();
    console.log(`🔗 ${this.config.name}: Initializing discovery chain building system...`);
  }

  async process(input: Discovery | Discovery[]): Promise<AgentMessage> {
    const discoveries = Array.isArray(input) ? input : [input];
    
    try {
      console.log(`🔗 ${this.config.name}: Analyzing ${discoveries.length} discoveries for chain opportunities`);
      
      // Find connection opportunities between discoveries
      const newOpportunities = await this.findConnectionOpportunities(discoveries);
      this.chainOpportunities.push(...newOpportunities);
      
      // Generate research suggestions based on validated discoveries
      const validatedDiscoveries = this.discoveryManager.getValidatedDiscoveries(10);
      const researchSuggestions = await this.generateResearchSuggestions(validatedDiscoveries);
      
      // Update thread relationships
      await this.updateThreadConnections(discoveries);
      
      this.processedConnections += discoveries.length;
      
      const message: AgentMessage = {
        id: this.generateMessageId(),
        content: JSON.stringify({
          action: 'chain_analysis',
          newConnections: newOpportunities.length,
          researchSuggestions: researchSuggestions,
          totalOpportunities: this.chainOpportunities.length,
          processedCount: this.processedConnections
        }),
        timestamp: new Date(),
        agentName: this.config.name,
        type: 'chain'
      };

      if (researchSuggestions.length > 0) {
        console.log(`🧬 ${this.config.name}: Generated ${researchSuggestions.length} research suggestions`);
      }

      return message;
      
    } catch (error) {
      console.error(`Error in chain building:`, error);
      
      return {
        id: this.generateMessageId(),
        content: JSON.stringify({
          action: 'chain_error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }),
        timestamp: new Date(),
        agentName: this.config.name,
        type: 'chain'
      };
    }
  }

  getStatus(): string {
    return `Active - Connections: ${this.chainOpportunities.length}, Processed: ${this.processedConnections}`;
  }

  private async findConnectionOpportunities(discoveries: Discovery[]): Promise<ChainOpportunity[]> {
    const opportunities: ChainOpportunity[] = [];
    const existingDiscoveries = this.discoveryManager.getValidatedDiscoveries(20);
    
    for (const newDiscovery of discoveries) {
      if (newDiscovery.status !== 'validated') continue;
      
      for (const existingDiscovery of existingDiscoveries) {
        if (newDiscovery.id === existingDiscovery.id) continue;
        
        const connection = await this.analyzeConnection(newDiscovery, existingDiscovery);
        if (connection && connection.connectionStrength >= 6) {
          opportunities.push(connection);
        }
      }
    }
    
    return opportunities;
  }

  private async analyzeConnection(discovery1: Discovery, discovery2: Discovery): Promise<ChainOpportunity | null> {
    const connectionPrompt = `Analyze the potential connection between these two discoveries:

    DISCOVERY 1: "${discovery1.finding}"
    - Novelty: ${discovery1.noveltyExplanation}
    - Sources: ${discovery1.sourcesSynthesized.map(s => s.title).join(', ')}
    
    DISCOVERY 2: "${discovery2.finding}"
    - Novelty: ${discovery2.noveltyExplanation}
    - Sources: ${discovery2.sourcesSynthesized.map(s => s.title).join(', ')}
    
    Analyze for potential connections:
    1. Does one discovery build upon or extend the other?
    2. Do they contradict each other in interesting ways?
    3. Do they intersect in unexpected domains?
    4. Could one be a practical application of the other?
    5. Do they reveal a larger pattern when combined?
    
    Respond with JSON:
    {
      "hasConnection": "true|false",
      "connectionType": "builds_on|contradicts|intersects|applies",
      "connectionStrength": "Score 1-10 for strength of connection",
      "explanation": "Detailed explanation of the connection"
    }
    
    Only identify meaningful connections (6+ strength).`;

    try {
      const response = await this.runAgent(connectionPrompt);
      const analysis = JSON.parse(response);
      
      if (analysis.hasConnection === true && analysis.connectionStrength >= 6) {
        return {
          sourceDiscoveryId: discovery1.id,
          targetDiscoveryId: discovery2.id,
          connectionType: analysis.connectionType || 'intersects',
          connectionStrength: Math.min(10, Math.max(1, analysis.connectionStrength || 5)),
          explanation: analysis.explanation || 'Connection identified but not explained'
        };
      }
      
      return null;
      
    } catch (error) {
      console.error('Error analyzing connection:', error);
      return null;
    }
  }

  private async generateResearchSuggestions(discoveries: Discovery[]): Promise<ResearchSuggestion[]> {
    if (discoveries.length === 0) return [];
    
    const discoveryContext = discoveries.slice(0, 5).map(d => 
      `"${d.finding}" (Novelty: ${d.noveltyScore}/10)`
    ).join('\n');

    const suggestionPrompt = `Based on these validated discoveries, suggest 3 high-potential research directions that could lead to breakthrough insights:

    VALIDATED DISCOVERIES:
    ${discoveryContext}
    
    Generate research suggestions that:
    1. Build deeper into the most promising discoveries
    2. Look for contradictions or challenges to current findings
    3. Explore practical applications or implications
    4. Seek intersections between different discovery domains
    
    Respond with JSON array:
    [{
      "suggestedTopic": "Specific research topic description",
      "priority": "Score 1-10 for potential breakthrough value",
      "basedOnDiscoveries": ["List of discovery IDs this builds on"],
      "reasoning": "Why this research direction has high potential",
      "type": "deep_dive|contradiction_check|application_explore|intersection"
    }]
    
    Focus on suggestions with breakthrough potential (8+ priority).`;

    try {
      const response = await this.runAgent(suggestionPrompt);
      const suggestions = JSON.parse(response);
      
      return suggestions
        .filter((s: any) => s.priority >= 7) // Only high-potential suggestions
        .map((s: any) => ({
          suggestedTopic: s.suggestedTopic || 'Research suggestion not specified',
          priority: Math.min(10, Math.max(1, s.priority || 7)),
          basedOnDiscoveries: s.basedOnDiscoveries || [],
          reasoning: s.reasoning || 'Reasoning not provided',
          type: s.type || 'deep_dive'
        }));
        
    } catch (error) {
      console.error('Error generating research suggestions:', error);
      return [];
    }
  }

  private async updateThreadConnections(discoveries: Discovery[]): Promise<void> {
    // Update discovery threads based on identified connections
    for (const discovery of discoveries) {
      if (discovery.status !== 'validated') continue;
      
      // Find strong connections to existing discoveries
      const strongConnections = this.chainOpportunities.filter(
        opp => (opp.sourceDiscoveryId === discovery.id || opp.targetDiscoveryId === discovery.id) 
               && opp.connectionStrength >= 8
      );
      
      // Update buildsOn relationships for strong connections
      if (strongConnections.length > 0) {
        const connectedDiscoveryIds = strongConnections.map(conn => 
          conn.sourceDiscoveryId === discovery.id ? conn.targetDiscoveryId : conn.sourceDiscoveryId
        );
        
        // Add these as buildsOn relationships (in a real system, you'd update the discovery)
        console.log(`🔗 ${this.config.name}: Connected "${discovery.finding}" to ${connectedDiscoveryIds.length} discoveries`);
      }
    }
  }

  // Public method to get research suggestions for the Research Director
  async getResearchSuggestions(): Promise<ResearchSuggestion[]> {
    const validatedDiscoveries = this.discoveryManager.getValidatedDiscoveries(10);
    return this.generateResearchSuggestions(validatedDiscoveries);
  }

  // Convert research suggestions to research topics
  convertSuggestionsToTopics(suggestions: ResearchSuggestion[]): ResearchTopic[] {
    return suggestions.map((suggestion, index) => ({
      id: `chain-suggestion-${Date.now()}-${index}`,
      topic: suggestion.suggestedTopic,
      priority: suggestion.priority,
      status: 'pending' as const,
      parentDiscoveryId: suggestion.basedOnDiscoveries[0] // Use first discovery as parent
    }));
  }

  getConnectionOpportunities(): ChainOpportunity[] {
    return [...this.chainOpportunities];
  }

  getChainStats(): {
    totalConnections: number;
    strongConnections: number;
    averageConnectionStrength: number;
    connectionTypes: Record<string, number>;
  } {
    const strongConnections = this.chainOpportunities.filter(opp => opp.connectionStrength >= 8);
    const avgStrength = this.chainOpportunities.length > 0
      ? this.chainOpportunities.reduce((sum, opp) => sum + opp.connectionStrength, 0) / this.chainOpportunities.length
      : 0;
    
    const connectionTypes: Record<string, number> = {};
    for (const opp of this.chainOpportunities) {
      connectionTypes[opp.connectionType] = (connectionTypes[opp.connectionType] || 0) + 1;
    }
    
    return {
      totalConnections: this.chainOpportunities.length,
      strongConnections: strongConnections.length,
      averageConnectionStrength: avgStrength,
      connectionTypes
    };
  }
} 