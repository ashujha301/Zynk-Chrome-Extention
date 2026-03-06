// Convert normalised (0..1) coordinates to viewport pixels
function toViewport(nx, ny) {
  return {
    x: Math.round(nx * window.innerWidth),
    y: Math.round(ny * window.innerHeight)
  };
}

// Find the text node and character offset at a screen point
function getTextNodeAt(x, y) {
  var el = document.elementFromPoint(x, y);
  if (!el) return null;
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  var node;
  while ((node = walker.nextNode())) {
    var range = document.createRange();
    range.selectNodeContents(node);
    var rects = Array.from(range.getClientRects());
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        // Binary search for char offset
        var lo = 0, hi = node.textContent.length;
        while (lo < hi) {
          var mid = Math.floor((lo + hi) / 2);
          var r2  = document.createRange();
          r2.setStart(node, 0);
          r2.setEnd(node, mid);
          if (r2.getBoundingClientRect().right < x) lo = mid + 1;
          else hi = mid;
        }
        return { node: node, offset: lo };
      }
    }
  }
  return null;
}
