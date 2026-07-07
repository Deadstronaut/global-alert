// Pure client-side filter for the SOP Repository panel (spec 033,
// MHEWS-FR-0184). No full-text search infra — the SOP list is small
// enough that a simple partial-match title search is sufficient (YAGNI).

export function filterSopDocuments(sopDocuments, { category, searchTerm } = {}) {
  return (sopDocuments ?? []).filter((s) => {
    const matchesCategory = !category || s.category === category;
    const matchesSearch = !searchTerm || (s.title ?? '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });
}
