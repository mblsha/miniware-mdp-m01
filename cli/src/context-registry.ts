/**
 * Device context management for MDP CLI.
 * Handles categorization of devices (PSU vs Load) and alias assignment.
 */

export type DeviceCategory = 'psu' | 'load';

export interface DeviceContextParams {
  portPath: string;
  category: DeviceCategory;
  machineType: string;
}

export interface DeviceContext extends DeviceContextParams {
  alias: string;
  index: number;
}

/**
 * Registry that manages device contexts and their aliases.
 *
 * Alias assignment rules:
 * - Single device of a category: simple alias (e.g., "psu" or "load")
 * - Multiple devices of same category: numbered aliases (e.g., "psu1", "psu2")
 * - When multiple devices exist, the base category name becomes ambiguous
 *
 * IMPORTANT: Devices are sorted by portPath to ensure stable ordering across
 * reboots and USB topology changes. This prevents "psu1" from unexpectedly
 * pointing to a different physical device.
 */
export class ContextRegistry {
  private readonly aliasMap = new Map<string, DeviceContext>();
  private readonly ambiguousCategories = new Set<DeviceCategory>();
  public readonly uniqueContextsByCategory: Record<DeviceCategory, DeviceContext[]> = {
    psu: [],
    load: []
  };

  constructor(contexts: DeviceContextParams[]) {
    const groups: Record<DeviceCategory, DeviceContextParams[]> = {
      psu: [],
      load: []
    };
    contexts.forEach((context) => {
      groups[context.category].push(context);
    });

    (['psu', 'load'] as DeviceCategory[]).forEach((category) => {
      // Sort by portPath for stable ordering across reboots/topology changes
      const devices = groups[category].sort((a, b) => a.portPath.localeCompare(b.portPath));
      if (devices.length === 0) {
        return;
      }

      if (devices.length > 1) {
        this.ambiguousCategories.add(category);
      }

      devices.forEach((context, index) => {
        const alias = devices.length === 1 ? category : `${category}${index + 1}`;
        const device: DeviceContext = {
          ...context,
          alias,
          index: index + 1
        };
        this.aliasMap.set(alias, device);
        this.pushUnique(device);
      });
    });
  }

  private pushUnique(context: DeviceContext): void {
    const list = this.uniqueContextsByCategory[context.category];
    if (!list.some((entry) => entry.portPath === context.portPath)) {
      list.push(context);
    }
  }

  getContext(alias: string): DeviceContext | undefined {
    return this.aliasMap.get(alias);
  }

  getAliases(): string[] {
    return Array.from(this.aliasMap.keys()).sort();
  }

  getAmbiguousCategories(): DeviceCategory[] {
    return Array.from(this.ambiguousCategories);
  }

  describe(): string[] {
    const lines: string[] = ['Detected device contexts:'];
    this.getAliases().forEach((alias) => {
      const ctx = this.aliasMap.get(alias);
      if (!ctx) return;
      lines.push(`  ${alias} -> ${ctx.category.toUpperCase()} (${ctx.machineType})`);
    });

    if (this.ambiguousCategories.size > 0) {
      lines.push('Ambiguous names:');
      this.getAmbiguousCategories().forEach((category) => {
        const hints = this.uniqueContextsByCategory[category].map((ctx) => ctx.alias).join(', ');
        lines.push(`  ${category} (use ${hints})`);
      });
    }

    return lines;
  }
}

/**
 * Determines the device category based on machine type string.
 * L1060 devices are categorized as 'load', all others as 'psu'.
 */
export function categorizeDevice(machineType: string): DeviceCategory {
  return machineType.toLowerCase().includes('l1060') ? 'load' : 'psu';
}
