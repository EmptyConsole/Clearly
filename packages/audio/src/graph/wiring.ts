// Records every connection buildProcessingGraph makes, so the topology can be inspected and
// tested (Web Audio offers no way to list a node's connections).

export type NodeRole =
  | 'source'
  | 'destination'
  | 'upmix'
  | 'inputMonitor'
  | 'hum'
  | 'cleanup'
  | 'voiceFocus'
  | 'eq'
  | 'merge'
  | 'preAttenuation'
  | 'compressor'
  | 'programLimiter'
  | 'loudestLimiter'
  | 'wetGain'
  | 'dryDelay'
  | 'dryGain'
  | 'sum'
  | 'master'
  | 'safetyLimiter'
  | 'analyser'
  | 'outputMonitor';

export interface TopologyNode {
  readonly id: number;
  readonly role: NodeRole;
  readonly label: string;
}

export interface TopologyEdge {
  readonly from: number;
  readonly to: number;
}

export interface Topology {
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly TopologyEdge[];
}

export class Wiring {
  private readonly ids = new Map<AudioNode, TopologyNode>();
  private readonly nodeList: TopologyNode[] = [];
  private readonly edgeList: TopologyEdge[] = [];
  private readonly connected: [AudioNode, AudioNode | AudioParam, number, number][] = [];

  add<T extends AudioNode>(node: T, role: NodeRole, label: string = role): T {
    if (!this.ids.has(node)) {
      const n = { id: this.nodeList.length, role, label };
      this.ids.set(node, n);
      this.nodeList.push(n);
    }
    return node;
  }

  connect(from: AudioNode, to: AudioNode, output = 0, input = 0): void {
    const a = this.ids.get(from);
    const b = this.ids.get(to);
    if (!a || !b) throw new Error('connect: both nodes must be registered first');
    from.connect(to, output, input);
    this.edgeList.push({ from: a.id, to: b.id });
    this.connected.push([from, to, output, input]);
  }

  /** Chains nodes in order: a -> b -> c. */
  chain(...nodes: AudioNode[]): void {
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1];
      const b = nodes[i];
      if (a && b) this.connect(a, b);
    }
  }

  topology(): Topology {
    return { nodes: [...this.nodeList], edges: [...this.edgeList] };
  }

  /** Undoes exactly the connections made here (the host's own connections are left alone). */
  disconnectAll(): void {
    for (const [from, to, output, input] of this.connected) {
      try {
        if (to instanceof AudioNode) from.disconnect(to, output, input);
        else from.disconnect(to, output);
      } catch {
        // Already disconnected.
      }
    }
    this.connected.length = 0;
  }
}
