export interface VersionedArtifact<T> {
  name: string;
  version: number;
  schemaVersion: number;
  isDeprecated?: boolean;
  definition: T;
}

/** Side-by-side version registry for workflows/rules (docs/35-Versioning). */
export class VersionRegistry<T> {
  private readonly items = new Map<string, VersionedArtifact<T>>();

  key(name: string, version: number): string {
    return `${name}@${version}`;
  }

  register(artifact: VersionedArtifact<T>): void {
    this.items.set(this.key(artifact.name, artifact.version), artifact);
  }

  get(name: string, version?: number): VersionedArtifact<T> | undefined {
    if (version !== undefined) {
      return this.items.get(this.key(name, version));
    }
    const matches = [...this.items.values()]
      .filter((a) => a.name === name && !a.isDeprecated)
      .sort((a, b) => b.version - a.version);
    return matches[0];
  }

  list(name?: string): VersionedArtifact<T>[] {
    const all = [...this.items.values()];
    return name ? all.filter((a) => a.name === name) : all;
  }
}
