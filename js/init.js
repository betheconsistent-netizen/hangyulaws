// init.js - 앱 진입점
document.addEventListener('DOMContentLoaded', function () {
  try {
    AppUI.initApp();
  } catch (err) {
    console.error('[App]', err);
    var el = document.getElementById('view-container');
    if (el) el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>초기화 오류: ' + err.message + '</p></div>';
  }
});
