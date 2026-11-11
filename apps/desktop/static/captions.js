/* global document, window */
// Floating captions page (desktop). Text arrives from the main window through the captions
// preload. Final lines move up; Escape or the button closes the window.
'use strict';
(function () {
  var current = document.getElementById('current');
  var previous = document.getElementById('previous');
  var close = document.getElementById('close');
  window.clearlyCaptions.onCaption(function (c) {
    if (c.final) {
      previous.textContent = c.text;
      current.textContent = '';
    } else {
      current.textContent = c.text;
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.close();
  });
  close.addEventListener('click', function () {
    window.close();
  });
})();
