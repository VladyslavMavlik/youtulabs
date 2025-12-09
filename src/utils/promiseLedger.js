/**
 * Promise Ledger - tracks Chekhov's guns across acts in long mode
 */

export class PromiseLedger {
  constructor() {
    this.promises = [];
  }

  /**
   * Add promises from checklist
   */
  addPromises(checklistItems, actNumber) {
    checklistItems.forEach(item => {
      this.promises.push({
        item,
        introduced_in_act: actNumber,
        must_resolve_by: null, // Will be set based on story structure
        resolved: false
      });
    });
  }

  /**
   * Mark promises as resolved based on checklist resolution from Haiku
   */
  updateResolutions(checklistResolution) {
    checklistResolution.forEach(resolution => {
      // Parse resolution: "item: resolved/partial/missing"
      const parts = resolution.split(':');
      if (parts.length >= 2) {
        const status = parts[1].trim().toLowerCase();

        // Find matching promise
        const promise = this.promises.find(p =>
          p.item.toLowerCase().includes(parts[0].trim().toLowerCase()) ||
          parts[0].trim().toLowerCase().includes(p.item.toLowerCase())
        );

        if (promise && status.includes('resolved')) {
          promise.resolved = true;
        }
      }
    });
  }

  /**
   * Get unresolved promises for next act
   */
  getUnresolvedPromises() {
    return this.promises.filter(p => !p.resolved);
  }

  /**
   * Generate context summary for next act
   */
  generateContextSummary(lastActText) {
    const unresolved = this.getUnresolvedPromises();

    // Extract last few paragraphs from previous act
    const paragraphs = lastActText.split('\n\n').filter(p => p.trim());

    // Take more paragraphs for better context (7 instead of 5)
    const lastParagraphs = paragraphs.slice(-7).join('\n\n');

    // Increase summary limit from 500 to 1500 characters for better continuity
    const summary = lastParagraphs.substring(0, 1500);

    const unresolvedList = unresolved.map(p => `- ${p.item}`).join('\n');

    return `PREVIOUS ACT ENDING:\n${summary}...\n\nUNRESOLVED PLOT ELEMENTS:\n${unresolvedList || '(none)'}`;
  }

  /**
   * Get summary for final validation
   */
  getSummary() {
    const total = this.promises.length;
    const resolved = this.promises.filter(p => p.resolved).length;
    const unresolved = this.promises.filter(p => !p.resolved);

    return {
      total,
      resolved,
      unresolved_count: unresolved.length,
      unresolved_items: unresolved.map(p => p.item),
      resolution_rate: total > 0 ? (resolved / total) * 100 : 100
    };
  }
}
