// redirect.js - 랜딩 경유 여부 확인
(function () {
  var ok = sessionStorage.getItem('subvalue_from_landing') ||
           sessionStorage.getItem('subvalue_fresh');
  if (!ok) {
    var href = window.location.href;
    var base = href.substring(0, href.lastIndexOf('subvalue.html'));
    window.location.replace(base + 'index.html');
  }
})();
