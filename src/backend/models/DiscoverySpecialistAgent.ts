import { DiscoveryAgent, DiscoveryAgentConfig, AgentMessage } from './Agent';
import { DiscoveryManager, Discovery, Source } from './Discovery';
import { ResearchTopic } from './ResearchDirectorAgent';
import { tool, webSearchTool } from '@openai/agents';
import { z } from 'zod';

export class DiscoverySpecialistAgent extends DiscoveryAgent {
  private discoveryManager: DiscoveryManager;
  private currentResearch: ResearchTopic | null = null;

  constructor(discoveryManager: DiscoveryManager, specialization: string = 'General') {
    const config: DiscoveryAgentConfig = {
      name: `Discovery Specialist (${specialization})`,
      role: 'Deep Research & Synthesis',
      specialization: specialization,
      instructions: `You are a Discovery Specialist focused on ${specialization}. Your mission is to:
        1. Conduct deep research on assigned topics using web search across multiple sources
        2. Synthesize information from different sources to identify novel insights
        3. Focus on discovering previously unknown connections or contradictions
        4. Prioritize breakthrough potential over incremental findings
        5. Always cite and explain how sources were combined for insights
        
        Research methodology:
        - Use web search to find recent academic papers, industry reports, and authoritative sources
        - Look for intersections between different fields or domains
        - Identify contradictory information that might reveal new insights
        - Seek practical applications or implications of theoretical work
        - Always gather at least 3 diverse sources before synthesizing
        
        Only propose discoveries that represent genuinely novel insights or surprising connections.
        
        When analyzing sources for insights, respond with JSON:
        {
          "finding": "One clear sentence describing the novel insight",
          "noveltyExplanation": "Why this is novel - what makes it new/unexpected/breakthrough",
          "noveltyScore": "Score 1-10 for genuine novelty (7+ threshold for acceptance)",
          "sourcesSynthesized": "Number of sources combined for this insight"
        }`,
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 1500,
      tools: [
        webSearchTool(),
        tool({
          name: 'synthesize_sources',
          description: 'Synthesize multiple research sources to identify novel connections and insights',
          parameters: z.object({
            topic: z.string(),
            sources: z.array(z.object({
              title: z.string(),
              content: z.string(),
              url: z.string()
            })),
            synthesisFocus: z.string()
          }),
          execute: async ({ topic, sources, synthesisFocus }) => {
            // This tool helps structure the synthesis process
            return `Synthesizing ${sources.length} sources for ${topic} with focus on: ${synthesisFocus}`;
          }
        })
      ]
    };

    super(config);
    this.discoveryManager = discoveryManager;
  }

  async initialize(): Promise<void> {
    await super.initialize();
    console.log(`🔬 ${this.config.name}: Initializing web search capabilities...`);
  }

  async process(researchTopic: ResearchTopic): Promise<AgentMessage> {
    this.currentResearch = researchTopic;
    
    try {
      console.log(`🔍 ${this.config.name}: Beginning web research on "${researchTopic.topic}"`);
      
      // Step 1: Gather information from multiple web sources
      const sources = await this.gatherWebSources(researchTopic.topic);
      
      // Step 2: Analyze for novel connections across sources
      const analysis = await this.synthesizeMultipleSources(researchTopic, sources);
      
      // Step 3: Create discovery if novel insight found
      let discovery: Discovery | null = null;
      if (analysis.noveltyScore >= 7 && analysis.sourcesSynthesized >= 2) {
        discovery = this.discoveryManager.createDiscovery(
          analysis.finding,
          `${analysis.noveltyExplanation} (Synthesized from ${analysis.sourcesSynthesized} sources)`,
          sources,
          [this.config.name],
          researchTopic.parentDiscoveryId ? [researchTopic.parentDiscoveryId] : []
        );
        
        console.log(`💡 ${this.config.name}: Discovered - "${analysis.finding}" (Novelty: ${analysis.noveltyScore}/10, Sources: ${analysis.sourcesSynthesized})`);
      } else {
        console.log(`📝 ${this.config.name}: Research completed, but criteria not met (Novelty: ${analysis.noveltyScore}/10, Sources: ${analysis.sourcesSynthesized})`);
      }
      
      const message: AgentMessage = {
        id: this.generateMessageId(),
        content: JSON.stringify({
          action: 'research_completed',
          topic: researchTopic.topic,
          discovery: discovery ? {
            id: discovery.id,
            finding: discovery.finding,
            noveltyScore: analysis.noveltyScore,
            sourceCount: sources.length,
            sourcesSynthesized: analysis.sourcesSynthesized
          } : null,
          sourcesAnalyzed: sources.length,
          noveltyScore: analysis.noveltyScore,
          sourcesSynthesized: analysis.sourcesSynthesized
        }),
        timestamp: new Date(),
        agentName: this.config.name,
        type: 'discovery'
      };

      return message;
      
    } catch (error) {
      console.error(`Error in research process:`, error);
      
      return {
        id: this.generateMessageId(),
        content: JSON.stringify({
          action: 'research_error',
          topic: researchTopic.topic,
          error: error instanceof Error ? error.message : 'Unknown error'
        }),
        timestamp: new Date(),
        agentName: this.config.name,
        type: 'discovery'
      };
    }
  }

  getStatus(): string {
    return this.currentResearch 
      ? `Researching: ${this.currentResearch.topic.substring(0, 50)}...`
      : 'Ready for research assignment';
  }

  private async gatherWebSources(topic: string): Promise<Source[]> {
    try {
      // Generate diverse search queries for comprehensive coverage
      const searchQueries = this.generateSearchQueries(topic);
      const sources: Source[] = [];
      
      console.log(`🌐 ${this.config.name}: Searching with ${searchQueries.length} queries...`);
      
      // Perform web searches using the SDK's webSearchTool
      for (const query of searchQueries) {
        const searchPrompt = `Search for: "${query}"`;
        
        try {
          const response = await this.runAgent(searchPrompt);
          
          // Parse search results and convert to Source format
          const searchSources = this.parseSearchResults(response, query);
          sources.push(...searchSources);
          
          // Add small delay to avoid rate limiting
          await this.sleep(500);
          
        } catch (searchError) {
          console.warn(`Search query failed: ${query}`, searchError);
          continue;
        }
      }
      
      // Deduplicate and rank sources by credibility
      const uniqueSources = this.deduplicateAndRankSources(sources);
      
      console.log(`📚 ${this.config.name}: Gathered ${uniqueSources.length} unique sources`);
      return uniqueSources.slice(0, 5); // Limit to top 5 sources
      
    } catch (error) {
      console.error('Error gathering web sources:', error);
      return [];
    }
  }

  private generateSearchQueries(topic: string): string[] {
    const baseQueries = [
      topic,
      `${topic} research breakthrough`,
      `${topic} novel applications`,
      `${topic} interdisciplinary connections`,
      `recent developments ${topic}`
    ];
    
    // Add specialization-specific queries
    if (this.config.specialization) {
      baseQueries.push(
        `${topic} ${this.config.specialization.toLowerCase()}`,
        `${this.config.specialization.toLowerCase()} applications ${topic}`
      );
    }
    
    return baseQueries.slice(0, 4); // Limit to 4 queries to manage API costs
  }

  private parseSearchResults(response: string, query: string): Source[] {
    try {
      // Extract search results from the agent response
      // This is a simplified parser - in production you'd want more robust parsing
      const sources: Source[] = [];
      
      // Look for URLs and titles in the response
      const urlRegex = /https?:\/\/[^\s]+/g;
      const urls = response.match(urlRegex) || [];
      
      urls.forEach((url, index) => {
        // Extract title and content from context around the URL
        const beforeUrl = response.substring(0, response.indexOf(url));
        const afterUrl = response.substring(response.indexOf(url) + url.length);
        
        // Simple heuristic to extract title and key insight
        const titleMatch = beforeUrl.match(/([^.\n]+)(?=\s*https?:\/\/)/);
        const title = titleMatch ? titleMatch[1].trim() : `Search result ${index + 1} for: ${query}`;
        
        const contentMatch = afterUrl.match(/^[^.\n]*[.\n]/);
        const keyInsight = contentMatch ? contentMatch[0].trim() : `Information related to ${query}`;
        
        sources.push({
          url: url,
          title: title,
          keyInsight: keyInsight,
          credibility: this.estimateCredibility(url, title)
        });
      });
      
      return sources;
      
    } catch (error) {
      console.error('Error parsing search results:', error);
      return [];
    }
  }

  private estimateCredibility(url: string, title: string): number {
    let credibility = 5; // Base credibility
    
    // Academic and research domains get higher credibility
    if (url.includes('edu') || url.includes('arxiv') || url.includes('scholar')) {
      credibility += 3;
    }
    
    // Government and established organizations
    if (url.includes('gov') || url.includes('org')) {
      credibility += 2;
    }
    
    // Known tech publications
    if (url.includes('nature.com') || url.includes('science.org') || url.includes('ieee.org')) {
      credibility += 3;
    }
    
    // Research-focused titles
    if (title.toLowerCase().includes('research') || title.toLowerCase().includes('study')) {
      credibility += 1;
    }
    
    return Math.min(10, credibility);
  }

  private deduplicateAndRankSources(sources: Source[]): Source[] {
    // Remove duplicates based on URL similarity
    const uniqueSources = sources.filter((source, index, self) =>
      index === self.findIndex(s => s.url === source.url)
    );
    
    // Sort by credibility (highest first)
    return uniqueSources.sort((a, b) => b.credibility - a.credibility);
  }

  private async synthesizeMultipleSources(topic: ResearchTopic, sources: Source[]): Promise<{
    finding: string;
    noveltyExplanation: string;
    noveltyScore: number;
    sourcesSynthesized: number;
  }> {
    if (sources.length < 2) {
      return {
        finding: 'Insufficient sources for synthesis',
        noveltyExplanation: 'Need at least 2 sources for meaningful synthesis',
        noveltyScore: 2,
        sourcesSynthesized: sources.length
      };
    }

    const sourceContext = sources.map((source, index) => 
      `Source ${index + 1}: ${source.title}\nURL: ${source.url}\nKey Insight: ${source.keyInsight}\nCredibility: ${source.credibility}/10`
    ).join('\n\n');

    const parentContext = topic.parentDiscoveryId 
      ? `\nThis research builds on previous discovery: ${topic.parentDiscoveryId}`
      : '';

    const synthesisPrompt = `Synthesize insights from multiple sources about: "${topic.topic}"

    Sources to synthesize (${sources.length} total):
    ${sourceContext}${parentContext}

    Your task:
    1. Find novel connections between different sources that reveal something new
    2. Identify contradictions between sources that might indicate breakthrough potential
    3. Discover intersections between different domains/fields mentioned across sources
    4. Look for practical applications not mentioned in individual sources
    5. Ensure your insight genuinely combines information from multiple sources

    Requirements:
    - Only give novelty scores 7+ for genuinely surprising or breakthrough insights
    - The insight must synthesize information from at least 2 different sources
    - Explain which specific sources contributed to the novel insight
    
    Respond with JSON only.`;

    try {
      const response = await this.runAgent(synthesisPrompt);
      const analysis = JSON.parse(response);
      
      return {
        finding: analysis.finding || 'No significant synthesis achieved',
        noveltyExplanation: analysis.noveltyExplanation || 'Limited novelty detected',
        noveltyScore: Math.min(10, Math.max(1, analysis.noveltyScore || 3)),
        sourcesSynthesized: Math.max(analysis.sourcesSynthesized || 0, sources.length >= 2 ? 2 : sources.length)
      };
      
    } catch (error) {
      console.error('Error in synthesis:', error);
      return {
        finding: 'Synthesis error occurred',
        noveltyExplanation: 'Unable to complete multi-source synthesis',
        noveltyScore: 2,
        sourcesSynthesized: 0
      };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Method to handle building on previous discoveries
  async researchWithContext(topic: ResearchTopic, parentDiscovery?: Discovery): Promise<AgentMessage> {
    if (parentDiscovery) {
      console.log(`🔗 ${this.config.name}: Building on discovery "${parentDiscovery.finding}"`);
      
      // Enhance research with parent discovery context
      const enhancedTopic: ResearchTopic = {
        ...topic,
        topic: `${topic.topic} (building on: ${parentDiscovery.finding})`
      };
      
      return this.process(enhancedTopic);
    }
    
    return this.process(topic);
  }

  getCurrentResearch(): ResearchTopic | null {
    return this.currentResearch;
  }

  getSpecialization(): string {
    return this.config.specialization || 'General';
  }
} 