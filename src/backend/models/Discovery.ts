import { v4 as uuidv4 } from 'uuid';

export interface Source {
  url: string;
  title: string;
  keyInsight: string;
  credibility: number; // 1-10 scale
}

export interface Discovery {
  id: string;
  finding: string;
  noveltyScore: number; // 1-10 scale
  noveltyExplanation: string;
  sourcesSynthesized: Source[];
  discoveredBy: string[]; // Agent names that contributed
  buildsOn: string[]; // IDs of previous discoveries
  threadId: string;
  researchNext: string[];
  timestamp: Date;
  status: 'pending' | 'validated' | 'rejected';
}

export interface DiscoveryThread {
  id: string;
  topic: string;
  discoveries: Discovery[];
  createdAt: Date;
  lastUpdated: Date;
  depth: number; // How many discoveries deep
}

export class DiscoveryManager {
  private discoveries: Map<string, Discovery> = new Map();
  private threads: Map<string, DiscoveryThread> = new Map();

  createDiscovery(
    finding: string,
    noveltyExplanation: string,
    sources: Source[],
    discoveredBy: string[],
    buildsOn: string[] = [],
    threadId?: string
  ): Discovery {
    const discovery: Discovery = {
      id: uuidv4(),
      finding,
      noveltyScore: 0, // To be set by Novelty Validator
      noveltyExplanation,
      sourcesSynthesized: sources,
      discoveredBy,
      buildsOn,
      threadId: threadId || this.createNewThread(finding).id,
      researchNext: [],
      timestamp: new Date(),
      status: 'pending'
    };

    this.discoveries.set(discovery.id, discovery);
    this.addDiscoveryToThread(discovery);
    return discovery;
  }

  private createNewThread(topic: string): DiscoveryThread {
    const thread: DiscoveryThread = {
      id: uuidv4(),
      topic,
      discoveries: [],
      createdAt: new Date(),
      lastUpdated: new Date(),
      depth: 0
    };

    this.threads.set(thread.id, thread);
    return thread;
  }

  private addDiscoveryToThread(discovery: Discovery): void {
    const thread = this.threads.get(discovery.threadId);
    if (thread) {
      thread.discoveries.push(discovery);
      thread.lastUpdated = new Date();
      thread.depth = Math.max(thread.depth, discovery.buildsOn.length + 1);
    }
  }

  updateDiscoveryStatus(discoveryId: string, status: Discovery['status'], noveltyScore?: number): void {
    const discovery = this.discoveries.get(discoveryId);
    if (discovery) {
      discovery.status = status;
      if (noveltyScore !== undefined) {
        discovery.noveltyScore = noveltyScore;
      }
    }
  }

  getDiscovery(id: string): Discovery | undefined {
    return this.discoveries.get(id);
  }

  getThread(id: string): DiscoveryThread | undefined {
    return this.threads.get(id);
  }

  getRecentDiscoveries(limit: number = 10): Discovery[] {
    return Array.from(this.discoveries.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  getValidatedDiscoveries(limit: number = 10): Discovery[] {
    return Array.from(this.discoveries.values())
      .filter(d => d.status === 'validated' && d.noveltyScore >= 7)
      .sort((a, b) => b.noveltyScore - a.noveltyScore)
      .slice(0, limit);
  }

  getAllThreads(): DiscoveryThread[] {
    return Array.from(this.threads.values())
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
  }

  getThreadDiscoveries(threadId: string): Discovery[] {
    const thread = this.threads.get(threadId);
    return thread ? thread.discoveries : [];
  }

  // Get discoveries that can be built upon (high novelty, recent)
  getSeedDiscoveries(): Discovery[] {
    return Array.from(this.discoveries.values())
      .filter(d => d.status === 'validated' && d.noveltyScore >= 8)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5);
  }
} 