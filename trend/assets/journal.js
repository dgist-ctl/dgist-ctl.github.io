/* 공통 저널 레이어 — 섹션 머리 정리(장식 기호 제거·번호·영문 부제 분리), 건너뛰기 링크 */
(function () {
  var EMO = /^[\s←-⯿①-⓿☀-➿️‍]+|^(?:[\uD83C-\uDBFF][\uDC00-\uDFFF]|️|‍|\s)+/;
  function clean(t) { var p; do { p = t; t = t.replace(EMO, ''); } while (t !== p); return t.trim(); }
  var ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV'];
  var PLAIN = /요약|읽는 법|Summary|How to Read|참고문헌|References|다른 호|Other Issues|More Issues/i;
  var n = 0;
  document.querySelectorAll('.sechead').forEach(function (h) {
    if (h.querySelector('.sh-k')) return;
    var t = clean(h.textContent.replace(/\s+/g, ' '));
    var k = t, e = '';
    var i = t.indexOf(' · ');
    if (i > 0) { k = t.slice(0, i); e = t.slice(i + 3); }
    h.textContent = '';
    var plain = PLAIN.test(t) || !h.closest('.article, .container');
    if (!plain) { var sn = document.createElement('span'); sn.className = 'sh-n'; sn.setAttribute('aria-hidden', 'true'); sn.textContent = ROMAN[n++] || ''; h.appendChild(sn); }
    else h.classList.add('plain');
    var sk = document.createElement('span'); sk.className = 'sh-k'; sk.textContent = k; h.appendChild(sk);
    if (e) { var se = document.createElement('span'); se.className = 'sh-e'; se.textContent = e; if (/^[\x00-\x7F’'—–]+$/.test(e)) se.lang = 'en'; h.appendChild(se); }
    h.setAttribute('role', 'heading'); h.setAttribute('aria-level', '2');
  });
  document.querySelectorAll('#railnav a, .toc a').forEach(function (a) { a.textContent = clean(a.textContent); });
  var main = document.querySelector('.paper, .container');
  if (main && !document.querySelector('.skip')) {
    if (!main.id) main.id = 'main';
    var s = document.createElement('a'); s.className = 'skip'; s.href = '#' + main.id;
    s.textContent = document.documentElement.lang === 'en' ? 'Skip to content' : '본문 바로가기';
    document.body.insertBefore(s, document.body.firstChild);
  }
})();
/* 편집 방침 접기 */
(function () {
  var en = document.documentElement.lang === 'en';
  document.querySelectorAll('.article .policy').forEach(function (p, i) {
    if (p.scrollHeight < 120) return;
    p.classList.add('fold'); p.id = p.id || 'policy' + i;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'policy-toggle';
    b.setAttribute('aria-controls', p.id); b.setAttribute('aria-expanded', 'false');
    var label = function (open) { return open ? (en ? 'Show less' : '접기') : (en ? 'Read full editorial policy' : '편집 방침 전체 보기'); };
    b.textContent = label(false);
    b.addEventListener('click', function () {
      var open = p.classList.toggle('fold') === false;
      b.setAttribute('aria-expanded', String(open)); b.textContent = label(open);
    });
    p.parentNode.insertBefore(b, p.nextSibling);
  });
})();
/* 항목별 링크 복사 · 인쇄 */
(function () {
  var en = document.documentElement.lang === 'en';
  var T = en ? { link: 'Copy link', done: 'Copied', print: 'Print' } : { link: '링크 복사', done: '복사됨', print: '인쇄' };
  function copy(text, btn) {
    var ok = function () { var o = btn.textContent; btn.textContent = T.done; setTimeout(function () { btn.textContent = o; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, function () {});
    else ok();
  }
  document.querySelectorAll('.article .item').forEach(function (it, i) {
    var no = it.querySelector('.no'), h = it.querySelector('h2');
    if (!h || !no || !/^\d+$/.test(no.textContent.trim())) return;  // 번호 없는 상자(실전 박스 등)는 제외
    var id = it.id || ('item-' + no.textContent.trim());
    if (document.getElementById(id) && document.getElementById(id) !== it) return;
    it.id = id;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'anchor';
    b.textContent = T.link; b.setAttribute('aria-label', (h.textContent.trim().slice(0, 40)) + ' — ' + T.link);
    b.addEventListener('click', function () { copy(location.origin + location.pathname + '#' + id, b); });
    h.appendChild(b);
  });
  var copyBtn = document.getElementById('copycite');
  if (copyBtn && !document.getElementById('printbtn')) {
    var wrap = document.createElement('div'); wrap.className = 'tools';
    copyBtn.parentNode.insertBefore(wrap, copyBtn); wrap.appendChild(copyBtn);
    var p = document.createElement('button'); p.type = 'button'; p.className = 'copy'; p.id = 'printbtn'; p.textContent = T.print;
    p.addEventListener('click', function () { window.print(); });
    wrap.appendChild(p);
  }
})();
