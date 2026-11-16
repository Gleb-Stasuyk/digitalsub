// Старые якоря одностраничной версии сайта ведут на новые страницы: /#faq -> /faq и т. д.
(function () {
  var map = { '#solutions': '/solutions', '#compare': '/buyout#compare', '#pricing': '/prices', '#calc': '/prices#calc', '#calculator': '/prices#calc', '#buyout': '/buyout', '#transfer': '/buyout#transfer', '#faq': '/faq' };
  var to = map[location.hash];
  if (to) location.replace(to);
})();
