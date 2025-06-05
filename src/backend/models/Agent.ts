import { Agent as OpenAIAgent, AgentConfiguration, run, tool } from '@openai/agents';
import { z } from 'zod';

export interface AgentMessage {
  id: string;
  content: string;
  timestamp: Date;
  agentName: string;
  type: 'research' | 'discovery' | 'validation' | 'chain' | 'coordination';
}

export interface DiscoveryAgentConfig {
  name: string;
  role: string;
  instructions: string;
  model?: string;
  specialization?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: any[];
}

export abstract class DiscoveryAgent {
  protected agent: OpenAIAgent;
  protected config: DiscoveryAgentConfig;
  protected isActive: boolean = false;
  protected specialization?: string;

  constructor(config: DiscoveryAgentConfig) {
    this.config = config;
    this.specialization = config.specialization;
    
    // Create OpenAI Agent with SDK configuration
    const agentConfig: Partial<AgentConfiguration> = {
      name: config.name,
      instructions: config.instructions,
      model: config.model || 'gpt-4o-mini',
      modelSettings: {
        temperature: config.temperature || 0.7,
        maxTokens: config.maxTokens || 1000,
      },
      tools: config.tools || [],
    };

    this.agent = new OpenAIAgent(agentConfig as AgentConfiguration);
  }

  async initialize(): Promise<void> {
    this.isActive = true;
    console.log(`🤖 ${this.config.name}: Initializing with OpenAI Agents SDK...`);
  }

  async process(input: any): Promise<AgentMessage> {
    try {
      const result = await run(this.agent, input.prompt || input.toString());
      
      return {
        id: this.generateMessageId(),
        content: this.extractContent(result),
        timestamp: new Date(),
        agentName: this.config.name,
        type: input.type || 'research'
      };
    } catch (error) {
      console.error(`Error in ${this.config.name}:`, error);
      throw error;
    }
  }

  abstract getStatus(): string;

  getName(): string {
    return this.config.name;
  }

  getRole(): string {
    return this.config.role;
  }

  getSpecialization(): string | undefined {
    return this.specialization;
  }

  isRunning(): boolean {
    return this.isActive;
  }

  protected generateMessageId(): string {
    return `${this.config.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Helper method to run the agent with OpenAI SDK
  protected async runAgent(prompt: string, context?: any): Promise<string> {
    try {
      console.log(`🔍 ${this.config.name}: Making OpenAI API call...`);
      
      // Add timeout wrapper (30 seconds)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('OpenAI API call timeout (30s)')), 30000);
      });
      
      const apiPromise = run(this.agent, prompt, {
        context: context
      });
      
      console.log(`🔍 ${this.config.name}: Waiting for OpenAI response...`);
      const result = await Promise.race([apiPromise, timeoutPromise]);
      console.log(`🔍 ${this.config.name}: OpenAI API call completed`);
      
      return this.extractContent(result);
    } catch (error) {
      console.error(`🔍 ${this.config.name}: Error running agent:`, error);
      
      if (error instanceof Error) {
        console.error(`🔍 ${this.config.name}: Error type:`, error.constructor.name);
        console.error(`🔍 ${this.config.name}: Error message:`, error.message);
      } else {
        console.error(`🔍 ${this.config.name}: Unknown error type:`, typeof error);
      }
      
      throw error;
    }
  }

  // Extract content from RunResult
  private extractContent(result: any): string {
    // Try different properties that might contain the result
    if (result.output) return JSON.stringify(result.output);
    if (result.result) return JSON.stringify(result.result);
    if (result.content) return result.content;
    return JSON.stringify(result);
  }

  // Get the underlying OpenAI Agent instance
  getAgent(): OpenAIAgent {
    return this.agent;
  }
} 