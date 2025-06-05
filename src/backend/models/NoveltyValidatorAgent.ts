import { DiscoveryAgent, DiscoveryAgentConfig, AgentMessage } from './Agent';
import { DiscoveryManager, Discovery } from './Discovery';
import { tool } from '@openai/agents';
import { z } from 'zod';

export interface NoveltyAssessment {
  discoveryId: string;
  noveltyScore: number;
  validationReason: string;
  comparisonInsights: string[];
  recommendation: 'accept' | 'reject' | 'needs_review';
}

export class NoveltyValidatorAgent extends DiscoveryAgent {
  private discoveryManager: DiscoveryManager;
  private knowledgeBase: Map<string, string[]> = new Map(); // topic -> key insights
  private processedCount: number = 0;

  constructor(discoveryManager: DiscoveryManager) {
    const config: DiscoveryAgentConfig = {
      name: 'Novelty Validator',
      role: 'Novelty Assessment & Quality Control',
      instructions: `You are the Novelty Validator for a discovery system. Your critical mission is to:
        1. Rigorously assess the genuine novelty of proposed discoveries
        2. Maintain high standards - only accept truly novel insights (7+ novelty score)
        3. Compare against existing knowledge to identify overlaps or incremental changes
        4. Identify contradictions with previous discoveries that might indicate breakthrough potential
        5. Provide detailed validation reasoning for transparency
        
        Validation criteria:
        - Is this genuinely new information or a rehash of known concepts?
        - Does this reveal unexpected connections or contradict established understanding?
        - Would this surprise domain experts or change their perspective?
        - Is this actionable/impactful or merely interesting trivia?
        
        Be strict but fair - we want breakthrough discoveries, not incremental improvements.
        
        Respond with JSON:
        {
          "noveltyScore": "Score 1-10 (7+ for acceptance, be strict)",
          "validationReason": "Detailed explanation of why this score was assigned",
          "comparisonInsights": ["List of existing insights this was compared against"],
          "recommendation": "accept|reject|needs_review"
        }`,
      model: 'gpt-4o-mini',
      temperature: 0.2, // Low temperature for consistent, rigorous assessment
      maxTokens: 1000,
      tools: [
        tool({
          name: 'assess_novelty',
          description: 'Assess the novelty of a discovery against existing knowledge',
          parameters: z.object({
            discovery: z.string(),
            existingKnowledge: z.array(z.string())
          }),
          execute: async ({ discovery, existingKnowledge }) => {
            return `Assessed novelty of "${discovery}" against ${existingKnowledge.length} existing insights`;
          }
        })
      ]
    };

    super(config);
    this.discoveryManager = discoveryManager;
  }

  async initialize(): Promise<void> {
    await super.initialize();
    console.log(`🔍 ${this.config.name}: Initializing novelty validation system...`);
    
    // Build initial knowledge base from existing discoveries
    await this.buildKnowledgeBase();
  }

  async process(discovery: Discovery): Promise<AgentMessage> {
    this.processedCount++;
    
    try {
      console.log(`🔍 ${this.config.name}: Validating "${discovery.finding}" (${this.processedCount})`);
      
      // Perform novelty assessment
      const assessment = await this.assessNovelty(discovery);
      
      // Update discovery status based on assessment
      const finalStatus = assessment.recommendation === 'accept' ? 'validated' : 'rejected';
      this.discoveryManager.updateDiscoveryStatus(
        discovery.id, 
        finalStatus, 
        assessment.noveltyScore
      );
      
      // Update knowledge base if accepted
      if (assessment.recommendation === 'accept') {
        this.updateKnowledgeBase(discovery);
        console.log(`✅ ${this.config.name}: Validated discovery (Score: ${assessment.noveltyScore}/10)`);
      } else {
        console.log(`❌ ${this.config.name}: Rejected discovery (Score: ${assessment.noveltyScore}/10)`);
      }
      
      const message: AgentMessage = {
        id: this.generateMessageId(),
        content: JSON.stringify({
          action: 'novelty_validation',
          discoveryId: discovery.id,
          assessment: assessment,
          totalProcessed: this.processedCount,
          knowledgeBaseSize: this.knowledgeBase.size
        }),
        timestamp: new Date(),
        agentName: this.config.name,
        type: 'validation'
      };

      return message;
      
    } catch (error) {
      console.error(`Error in novelty validation:`, error);
      
      // Default to rejection if validation fails
      this.discoveryManager.updateDiscoveryStatus(discovery.id, 'rejected', 3);
      
      return {
        id: this.generateMessageId(),
        content: JSON.stringify({
          action: 'validation_error',
          discoveryId: discovery.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        }),
        timestamp: new Date(),
        agentName: this.config.name,
        type: 'validation'
      };
    }
  }

  getStatus(): string {
    return `Active - Processed: ${this.processedCount}, Knowledge Base: ${this.knowledgeBase.size} topics`;
  }

  private async buildKnowledgeBase(): Promise<void> {
    const existingDiscoveries = this.discoveryManager.getValidatedDiscoveries(50);
    
    for (const discovery of existingDiscoveries) {
      this.updateKnowledgeBase(discovery);
    }
    
    console.log(`📚 ${this.config.name}: Built knowledge base with ${this.knowledgeBase.size} topics`);
  }

  private updateKnowledgeBase(discovery: Discovery): void {
    // Extract key topics/domains from the discovery
    const topics = this.extractTopics(discovery.finding);
    
    for (const topic of topics) {
      if (!this.knowledgeBase.has(topic)) {
        this.knowledgeBase.set(topic, []);
      }
      
      const insights = this.knowledgeBase.get(topic)!;
      if (!insights.includes(discovery.finding)) {
        insights.push(discovery.finding);
        
        // Keep only recent insights per topic (max 10)
        if (insights.length > 10) {
          insights.shift();
        }
      }
    }
  }

  private extractTopics(finding: string): string[] {
    // Simple topic extraction - in production, you'd use more sophisticated NLP
    const topics: string[] = [];
    
    // Common domain keywords
    const domainPatterns = [
      /quantum/i, /AI|artificial intelligence/i, /blockchain/i, /biotech/i, 
      /space/i, /materials?/i, /energy/i, /computing/i, /neural/i, /genetic/i,
      /robot/i, /autonomous/i, /machine learning/i, /cryptocurrency/i, /climate/i
    ];
    
    for (const pattern of domainPatterns) {
      if (pattern.test(finding)) {
        topics.push(pattern.source.replace(/[\/\\i]/g, '').toLowerCase());
      }
    }
    
    return topics.length > 0 ? topics : ['general'];
  }

  private async assessNovelty(discovery: Discovery): Promise<NoveltyAssessment> {
    // Get relevant existing knowledge
    const relevantTopics = this.extractTopics(discovery.finding);
    const existingInsights: string[] = [];
    
    for (const topic of relevantTopics) {
      const topicInsights = this.knowledgeBase.get(topic) || [];
      existingInsights.push(...topicInsights);
    }
    
    // Create validation prompt
    const validationPrompt = `Assess the novelty of this proposed discovery:

    PROPOSED DISCOVERY: "${discovery.finding}"
    NOVELTY CLAIM: "${discovery.noveltyExplanation}"
    
    EXISTING KNOWLEDGE IN RELATED AREAS:
    ${existingInsights.length > 0 ? existingInsights.map(insight => `- ${insight}`).join('\n') : '- No prior related discoveries in knowledge base'}
    
    SOURCES USED:
    ${discovery.sourcesSynthesized.map(source => `- ${source.title}: ${source.keyInsight}`).join('\n')}
    
    Evaluation criteria:
    1. Is this genuinely novel or a variation of existing knowledge?
    2. Does this contradict or significantly extend current understanding?
    3. Would this surprise domain experts?
    4. Is the insight actionable/impactful beyond mere curiosity?
    5. How strong is the source synthesis (multiple credible sources)?
    
    Be rigorous - only breakthrough discoveries should score 7+.`;

    try {
      const response = await this.runAgent(validationPrompt);
      const validation = JSON.parse(response);
      
      return {
        discoveryId: discovery.id,
        noveltyScore: Math.min(10, Math.max(1, validation.noveltyScore || 5)),
        validationReason: validation.validationReason || 'No detailed reasoning provided',
        comparisonInsights: validation.comparisonInsights || [],
        recommendation: validation.recommendation === 'accept' && validation.noveltyScore >= 7 
          ? 'accept' 
          : 'reject'
      };
      
    } catch (error) {
      console.error('Error in novelty assessment:', error);
      return {
        discoveryId: discovery.id,
        noveltyScore: 3,
        validationReason: 'Validation failed due to processing error',
        comparisonInsights: [],
        recommendation: 'reject'
      };
    }
  }

  // Public method to get validation statistics
  getValidationStats(): {
    totalProcessed: number;
    acceptanceRate: number;
    averageNoveltyScore: number;
    knowledgeBaseTopics: number;
  } {
    const allDiscoveries = this.discoveryManager.getRecentDiscoveries(100);
    const validatedDiscoveries = allDiscoveries.filter(d => d.status === 'validated');
    const rejectedDiscoveries = allDiscoveries.filter(d => d.status === 'rejected');
    
    const totalScored = validatedDiscoveries.length + rejectedDiscoveries.length;
    const avgScore = totalScored > 0 
      ? [...validatedDiscoveries, ...rejectedDiscoveries]
          .reduce((sum, d) => sum + d.noveltyScore, 0) / totalScored
      : 0;
    
    return {
      totalProcessed: this.processedCount,
      acceptanceRate: totalScored > 0 ? validatedDiscoveries.length / totalScored : 0,
      averageNoveltyScore: avgScore,
      knowledgeBaseTopics: this.knowledgeBase.size
    };
  }

  // Method to manually review borderline discoveries
  async reviewDiscovery(discoveryId: string): Promise<NoveltyAssessment | null> {
    const discovery = this.discoveryManager.getDiscovery(discoveryId);
    if (!discovery) {
      return null;
    }
    
    return this.assessNovelty(discovery);
  }

  getKnowledgeBaseSnapshot(): Record<string, string[]> {
    const snapshot: Record<string, string[]> = {};
    for (const [topic, insights] of Array.from(this.knowledgeBase.entries())) {
      snapshot[topic] = [...insights];
    }
    return snapshot;
  }
} 