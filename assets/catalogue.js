/* Helpers shared by the public directory and tender catalogue. */
window.Catalogue = {
  text(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR'); },
  escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  values(value) { return Array.isArray(value) ? value : value ? [String(value)] : []; },
  source(value) {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value.trim());
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  },
  options(select, values, label) {
    const unique = [...new Set(values.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'fr'));
    select.replaceChildren(new Option(label, ''), ...unique.map(value=>new Option(value,value)));
  },
  paginate(items, page, size, counter, previous, next) {
    const pages = Math.max(1, Math.ceil(items.length / size));
    page = Math.min(Math.max(1, page), pages);
    previous.disabled = page <= 1;
    next.disabled = page >= pages;
    const start = (page - 1) * size;
    counter.textContent = items.length ? `${start + 1}–${Math.min(start + size,items.length)} sur ${items.length} · Page ${page}/${pages}` : '0 résultat';
    return {page, items:items.slice(start,start+size)};
  }
};
