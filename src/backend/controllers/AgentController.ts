import { DiscoveryManager, Discovery } from '../models/Discovery';
import { ResearchDirectorAgent, ResearchTopic } from '../models/ResearchDirectorAgent';
import { DiscoverySpecialistAgent } from '../models/DiscoverySpecialistAgent';
import { NoveltyValidatorAgent } from '../models/NoveltyValidatorAgent';
import { ChainBuilderAgent, ResearchSuggestion } from '../models/ChainBuilderAgent';
import { DiscoveryAgent, AgentMessage } from '../models/Agent';
import { handoff } from '@openai/agents';

export interface SystemStatus {
  isRunning: boolean;
  cycle: number;
  lastActivity: Date;
  agentStatuses: Record<string, string>;
  discoveryStats: {
    total: number;
    validated: number;
    pending: number;
    rejected: number;
  };
  performance: {
    discoveryRate: number; // discoveries per hour
    noveltyAverage: number;
    validationAccuracy: number;
  };
}

export class AgentController {
  private discoveryManager: DiscoveryManager;
  
  // Agents
  private researchDirector: ResearchDirectorAgent;
  private discoverySpecialists: DiscoverySpecialistAgent[] = [];
  private noveltyValidator: NoveltyValidatorAgent;
  private chainBuilder: ChainBuilderAgent;
  
  // System state
  private isRunning: boolean = false;
  private currentCycle: number = 0;
  private cycleInterval: NodeJS.Timeout | null = null;
  private messageQueue: AgentMessage[] = [];
  private lastActivity: Date = new Date();
  
  // Handoff configuration
  private handoffChain: Map<string, string[]> = new Map();
  
  // Configuration
  private readonly CYCLE_INTERVAL_MS = 30000; // 30 seconds between cycles
  private readonly MAX_PARALLEL_RESEARCH = 2; // Number of parallel research tasks

  constructor(openaiApiKey: string) {
    // Set the OpenAI API key for the SDK
    process.env.OPENAI_API_KEY = openaiApiKey;
    
    this.discoveryManager = new DiscoveryManager();
    
    // Initialize agents
    this.researchDirector = new ResearchDirectorAgent(this.discoveryManager);
    this.noveltyValidator = new NoveltyValidatorAgent(this.discoveryManager);
    this.chainBuilder = new ChainBuilderAgent(this.discoveryManager);
    
    // Initialize multiple discovery specialists with different specializations
    const specializations = ['Technology', 'Science', 'Applications'];
    for (const spec of specializations) {
      this.discoverySpecialists.push(
        new DiscoverySpecialistAgent(this.discoveryManager, spec)
      );
    }
    
    // Setup handoff chains for agent collaboration
    this.setupHandoffChains();
  }

  private setupHandoffChains(): void {
    // Define how agents can hand off to each other
    this.handoffChain.set('ResearchDirector', [
      'DiscoverySpecialist-Technology',
      'DiscoverySpecialist-Science', 
      'DiscoverySpecialist-Applications'
    ]);
    
    this.handoffChain.set('DiscoverySpecialist', [
      'NoveltyValidator',
      'ChainBuilder'
    ]);
    
    this.handoffChain.set('NoveltyValidator', [
      'ChainBuilder',
      'ResearchDirector'
    ]);
    
    this.handoffChain.set('ChainBuilder', [
      'ResearchDirector',
      'DiscoverySpecialist-Technology',
      'DiscoverySpecialist-Science'
    ]);
    
    console.log('🔄 Agent handoff chains configured');
  }

  async initialize(): Promise<void> {
    console.log('🚀 Multi-Agent Discovery System: Initializing...');
    
    try {
      // Initialize all agents in parallel
      await Promise.all([
        this.researchDirector.initialize(),
        this.noveltyValidator.initialize(),
        this.chainBuilder.initialize(),
        ...this.discoverySpecialists.map(agent => agent.initialize())
      ]);
      
      console.log('✅ All agents initialized successfully');
      console.log(`📊 System ready with ${this.discoverySpecialists.length} discovery specialists`);
      console.log('🤝 Agent handoffs enabled for collaborative research');
      
    } catch (error) {
      console.error('❌ Agent initialization failed:', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  System already running');
      return;
    }

    console.log('🏁 Starting Ambient Discovery Engine...');
    this.isRunning = true;
    this.lastActivity = new Date();
    
    // Start the main discovery cycle
    this.cycleInterval = setInterval(() => {
      this.runDiscoveryCycle().catch(error => {
        console.error('Error in discovery cycle:', error);
      });
    }, this.CYCLE_INTERVAL_MS);
    
    // Run first cycle immediately
    await this.runDiscoveryCycle();
    
    console.log('🔄 Discovery system running - continuous research active');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚠️  System already stopped');
      return;
    }

    console.log('🛑 Stopping discovery system...');
    this.isRunning = false;
    
    if (this.cycleInterval) {
      clearInterval(this.cycleInterval);
      this.cycleInterval = null;
    }
    
    console.log('✅ Discovery system stopped');
  }

  private async runDiscoveryCycle(): Promise<void> {
    if (!this.isRunning) return;
    
    this.currentCycle++;
    this.lastActivity = new Date();
    
    console.log(`\n🔄 === DISCOVERY CYCLE ${this.currentCycle} ===`);
    
    try {
      // Step 1: Research Director coordinates research strategy
      const directorMessage = await this.researchDirector.process(null);
      this.messageQueue.push(directorMessage);
      
      const directorData = JSON.parse(directorMessage.content);
      const currentTopic = directorData.topic as ResearchTopic | null;
      
      if (!currentTopic) {
        console.log('📝 No research topic selected for this cycle');
        return;
      }
      
      // Step 2: Execute intelligent handoff strategy for research
      const researchResults = await this.executeHandoffResearch(currentTopic);
      this.messageQueue.push(...researchResults.messages);
      
      // Step 3: Process discoveries through validation pipeline with handoffs
      const newDiscoveries: Discovery[] = [];
      
      for (const message of researchResults.messages) {
        const messageData = JSON.parse(message.content);
        if (messageData.discovery) {
          const discovery = this.discoveryManager.getDiscovery(messageData.discovery.id);
          if (discovery) {
            newDiscoveries.push(discovery);
          }
        }
      }
      
      // Step 4: Intelligent validation with potential handoffs
      const validationResults = await this.executeHandoffValidation(newDiscoveries);
      this.messageQueue.push(...validationResults);
      
      // Step 5: Chain building with cross-specialist synthesis
      const validatedDiscoveries = newDiscoveries.filter(d => d.status === 'validated');
      
      if (validatedDiscoveries.length > 0) {
        const chainResults = await this.executeHandoffChainBuilding(validatedDiscoveries);
        this.messageQueue.push(...chainResults.messages);
        
        // Use chain builder suggestions to enhance research director's queue
        if (chainResults.suggestions && chainResults.suggestions.length > 0) {
          const newTopics = this.chainBuilder.convertSuggestionsToTopics(chainResults.suggestions);
          
          // Add high-priority topics to research director
          for (const topic of newTopics.slice(0, 2)) { // Limit to 2 suggestions per cycle
            await this.addResearchTopic(topic);
          }
        }
      }
      
      // Step 6: Log cycle summary
      this.logCycleSummary(validatedDiscoveries.length, newDiscoveries.length);
      
    } catch (error) {
      console.error(`❌ Error in discovery cycle ${this.currentCycle}:`, error);
    }
  }

  private async executeHandoffResearch(topic: ResearchTopic): Promise<{
    messages: AgentMessage[];
    discoveries: Discovery[];
  }> {
    console.log(`🤝 Executing handoff research strategy for: "${topic.topic}"`);
    
    const messages: AgentMessage[] = [];
    const discoveries: Discovery[] = [];
    
    // Strategy 1: Parallel research by specialists with potential handoffs
    const selectedSpecialists = this.selectOptimalSpecialists(topic);
    
    console.log(`📡 Selected ${selectedSpecialists.length} specialists: ${selectedSpecialists.map(s => s.getSpecialization()).join(', ')}`);
    
    // Execute research with handoff coordination
    const researchPromises = selectedSpecialists.map(async (specialist) => {
      try {
        const result = await specialist.process(topic);
        
        // Check if handoff is beneficial based on result
        const shouldHandoff = await this.evaluateHandoffNeed(result, specialist);
        
        if (shouldHandoff.recommended) {
          console.log(`🔄 Handoff recommended: ${specialist.getName()} → ${shouldHandoff.targetAgent}`);
          
          const handoffResult = await this.executeAgentHandoff(
            specialist,
            shouldHandoff.targetAgent,
            topic,
            result
          );
          
          return [result, handoffResult];
        }
        
        return [result];
        
      } catch (error) {
        console.error(`Research error for ${specialist.getName()}:`, error);
        return [];
      }
    });
    
    const allResults = await Promise.all(researchPromises);
    const flatResults = allResults.flat();
    
    messages.push(...flatResults);
    
    return {
      messages,
      discoveries
    };
  }

  private selectOptimalSpecialists(topic: ResearchTopic): DiscoverySpecialistAgent[] {
    // Intelligent specialist selection based on topic content
    const topicLower = topic.topic.toLowerCase();
    const selected: DiscoverySpecialistAgent[] = [];
    
    // Always include at least one specialist
    if (topicLower.includes('tech') || topicLower.includes('ai') || topicLower.includes('software')) {
      selected.push(this.discoverySpecialists.find(s => s.getSpecialization() === 'Technology')!);
    }
    
    if (topicLower.includes('science') || topicLower.includes('research') || topicLower.includes('study')) {
      selected.push(this.discoverySpecialists.find(s => s.getSpecialization() === 'Science')!);
    }
    
    if (topicLower.includes('application') || topicLower.includes('practical') || topicLower.includes('use')) {
      selected.push(this.discoverySpecialists.find(s => s.getSpecialization() === 'Applications')!);
    }
    
    // If no specific match, select first two specialists
    if (selected.length === 0) {
      selected.push(...this.discoverySpecialists.slice(0, 2));
    }
    
    // Ensure we have at least 2 for synthesis
    if (selected.length === 1) {
      const remaining = this.discoverySpecialists.filter(s => !selected.includes(s));
      if (remaining.length > 0) {
        selected.push(remaining[0]);
      }
    }
    
    return selected.slice(0, this.MAX_PARALLEL_RESEARCH);
  }

  private async evaluateHandoffNeed(message: AgentMessage, specialist: DiscoverySpecialistAgent): Promise<{
    recommended: boolean;
    targetAgent: string;
    reason: string;
  }> {
    try {
      const messageData = JSON.parse(message.content);
      
      // Handoff conditions
      if (messageData.noveltyScore >= 6 && messageData.sourcesSynthesized >= 2) {
        // High-quality research that could benefit from validation
        return {
          recommended: true,
          targetAgent: 'NoveltyValidator',
          reason: 'High novelty score warrants immediate validation'
        };
      }
      
      if (messageData.sourcesAnalyzed >= 3 && messageData.noveltyScore < 5) {
        // Lots of sources but low novelty - might benefit from different perspective
        const otherSpecialists = this.discoverySpecialists.filter(s => s !== specialist);
        if (otherSpecialists.length > 0) {
          return {
            recommended: true,
            targetAgent: `DiscoverySpecialist-${otherSpecialists[0].getSpecialization()}`,
            reason: 'Multiple sources with low novelty - trying different specialization'
          };
        }
      }
      
      return {
        recommended: false,
        targetAgent: '',
        reason: 'No handoff needed'
      };
      
    } catch (error) {
      return {
        recommended: false,
        targetAgent: '',
        reason: 'Error evaluating handoff need'
      };
    }
  }

  private async executeAgentHandoff(
    fromAgent: DiscoveryAgent,
    toAgentName: string,
    topic: ResearchTopic,
    previousResult: AgentMessage
  ): Promise<AgentMessage> {
    console.log(`🤝 Executing handoff: ${fromAgent.getName()} → ${toAgentName}`);
    
    try {
      // Find target agent
      let targetAgent: DiscoveryAgent | null = null;
      
      if (toAgentName === 'NoveltyValidator') {
        targetAgent = this.noveltyValidator;
      } else if (toAgentName === 'ChainBuilder') {
        targetAgent = this.chainBuilder;
      } else if (toAgentName.startsWith('DiscoverySpecialist-')) {
        const specialization = toAgentName.replace('DiscoverySpecialist-', '');
        targetAgent = this.discoverySpecialists.find(s => s.getSpecialization() === specialization) || null;
      }
      
      if (!targetAgent) {
        throw new Error(`Target agent not found: ${toAgentName}`);
      }
      
      // Create handoff context
      const handoffContext = {
        fromAgent: fromAgent.getName(),
        previousResult: previousResult,
        topic: topic,
        handoffReason: 'Collaborative research handoff'
      };
      
      // For NoveltyValidator, process the discovery
      if (toAgentName === 'NoveltyValidator') {
        const messageData = JSON.parse(previousResult.content);
        if (messageData.discovery) {
          const discovery = this.discoveryManager.getDiscovery(messageData.discovery.id);
          if (discovery) {
            return await this.noveltyValidator.process(discovery);
          }
        }
      }
      
      // For other specialists, process the topic with context
      if (targetAgent instanceof DiscoverySpecialistAgent) {
        const enhancedTopic = {
          ...topic,
          topic: `${topic.topic} (handoff from ${fromAgent.getName()})`
        };
        return await targetAgent.process(enhancedTopic);
      }
      
      // Default fallback
      return {
        id: this.generateMessageId(),
        content: JSON.stringify({
          action: 'handoff_completed',
          fromAgent: fromAgent.getName(),
          toAgent: toAgentName,
          context: handoffContext
        }),
        timestamp: new Date(),
        agentName: toAgentName,
        type: 'coordination'
      };
      
    } catch (error) {
      console.error(`Handoff error: ${fromAgent.getName()} → ${toAgentName}`, error);
      
      return {
        id: this.generateMessageId(),
        content: JSON.stringify({
          action: 'handoff_failed',
          fromAgent: fromAgent.getName(),
          toAgent: toAgentName,
          error: error instanceof Error ? error.message : 'Unknown error'
        }),
        timestamp: new Date(),
        agentName: 'System',
        type: 'coordination'
      };
    }
  }

  private async executeHandoffValidation(discoveries: Discovery[]): Promise<AgentMessage[]> {
    const messages: AgentMessage[] = [];
    
    for (const discovery of discoveries) {
      try {
        const validationMessage = await this.noveltyValidator.process(discovery);
        messages.push(validationMessage);
        
        // Check if validation suggests handoff to chain builder
        const validationData = JSON.parse(validationMessage.content);
        if (validationData.action === 'validated' && validationData.chainBuildingPotential) {
          console.log(`🔗 Validation suggests chain building for discovery: ${discovery.id}`);
        }
        
      } catch (error) {
        console.error(`Validation error for discovery ${discovery.id}:`, error);
      }
    }
    
    return messages;
  }

  private async executeHandoffChainBuilding(discoveries: Discovery[]): Promise<{
    messages: AgentMessage[];
    suggestions: ResearchSuggestion[];
  }> {
    const messages: AgentMessage[] = [];
    const suggestions: ResearchSuggestion[] = [];
    
    try {
      const chainMessage = await this.chainBuilder.process(discoveries);
      messages.push(chainMessage);
      
      const chainData = JSON.parse(chainMessage.content);
      if (chainData.researchSuggestions) {
        suggestions.push(...chainData.researchSuggestions);
      }
      
    } catch (error) {
      console.error('Chain building error:', error);
    }
    
    return {
      messages,
      suggestions
    };
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private logCycleSummary(validatedCount: number, totalCount: number): void {
    const stats = this.getSystemStatus();
    
    console.log(`📈 Cycle ${this.currentCycle} Summary:`);
    console.log(`   • Discoveries: ${validatedCount}/${totalCount} validated`);
    console.log(`   • Total validated: ${stats.discoveryStats.validated}`);
    console.log(`   • Queue status: ${JSON.stringify(this.researchDirector.getQueueStatus())}`);
    console.log(`   • Chain connections: ${this.chainBuilder.getChainStats().totalConnections}`);
    console.log(`   • Handoff chains active: ${this.handoffChain.size}`);
  }

  // Voice command processing
  async processVoiceCommand(command: string): Promise<void> {
    console.log(`🎤 Processing voice command: "${command}"`);
    
    try {
      await this.researchDirector.processVoiceCommand(command);
      
      // Trigger immediate research cycle for voice commands
      if (this.isRunning) {
        await this.runDiscoveryCycle();
      }
      
    } catch (error) {
      console.error('Error processing voice command:', error);
    }
  }

  // Manual research topic addition
  async addResearchTopic(topic: ResearchTopic): Promise<void> {
    // This would be implemented by extending the ResearchDirectorAgent interface
    console.log(`📝 Adding research topic: "${topic.topic}"`);
  }

  getSystemStatus(): SystemStatus {
    const allDiscoveries = this.discoveryManager.getRecentDiscoveries(100);
    const validatedDiscoveries = allDiscoveries.filter(d => d.status === 'validated');
    const pendingDiscoveries = allDiscoveries.filter(d => d.status === 'pending');
    const rejectedDiscoveries = allDiscoveries.filter(d => d.status === 'rejected');
    
    // Calculate performance metrics
    const hoursRunning = (Date.now() - this.lastActivity.getTime()) / (1000 * 60 * 60);
    const discoveryRate = hoursRunning > 0 ? validatedDiscoveries.length / hoursRunning : 0;
    const noveltyAverage = validatedDiscoveries.length > 0 
      ? validatedDiscoveries.reduce((sum, d) => sum + d.noveltyScore, 0) / validatedDiscoveries.length 
      : 0;
    const validationAccuracy = this.noveltyValidator.getValidationStats().acceptanceRate;
    
    return {
      isRunning: this.isRunning,
      cycle: this.currentCycle,
      lastActivity: this.lastActivity,
      agentStatuses: {
        'Research Director': this.researchDirector.getStatus(),
        'Novelty Validator': this.noveltyValidator.getStatus(),
        'Chain Builder': this.chainBuilder.getStatus(),
        ...Object.fromEntries(
          this.discoverySpecialists.map(agent => [agent.getName(), agent.getStatus()])
        )
      },
      discoveryStats: {
        total: allDiscoveries.length,
        validated: validatedDiscoveries.length,
        pending: pendingDiscoveries.length,
        rejected: rejectedDiscoveries.length
      },
      performance: {
        discoveryRate,
        noveltyAverage,
        validationAccuracy
      }
    };
  }

  getRecentDiscoveries(limit: number = 10): Discovery[] {
    return this.discoveryManager.getValidatedDiscoveries(limit);
  }

  getAllThreads() {
    return this.discoveryManager.getAllThreads();
  }

  getDiscoveryThread(threadId: string) {
    return this.discoveryManager.getThread(threadId);
  }

  // Get real-time messages for UI
  getRecentMessages(limit: number = 20): AgentMessage[] {
    return this.messageQueue
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Clear old messages to prevent memory buildup
  private cleanupMessages(): void {
    if (this.messageQueue.length > 1000) {
      this.messageQueue = this.messageQueue.slice(-500);
    }
  }

  // Get detailed agent statistics
  getAgentStats() {
    return {
      validation: this.noveltyValidator.getValidationStats(),
      chains: this.chainBuilder.getChainStats(),
      research: this.researchDirector.getQueueStatus(),
      specialists: this.discoverySpecialists.map(agent => ({
        name: agent.getName(),
        specialization: agent.getSpecialization(),
        status: agent.getStatus(),
        currentResearch: agent.getCurrentResearch()
      }))
    };
  }
} 