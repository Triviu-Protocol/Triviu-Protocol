
      /* The reader is not wired to a chain yet, and this says so out loud instead of
         letting the button do nothing. A control that appears to work and does not is
         the same lie as a placeholder number — it is just told with a click. */
      (function(){
        var b = document.getElementById('lpPosRead');
        var e = document.getElementById('lpPosEmpty');
        if(!b || !e) return;
        b.addEventListener('click', function(){
          var bruto = (document.getElementById('lpPosId') || {}).value || '';
          var id = String(bruto).replace(/[^0-9]/g, '');
          var net = (document.getElementById('lpPosNet') || {}).value || '137';
          /* Build the whole string first, THEN substitute. Chaining .replace() onto a
             concatenation binds it to the last literal only — the placeholders in the
             earlier fragments would have survived into the page. */
          var texto = '<b>Not wired yet, and the honest thing is to say so.</b> The layout of '
            + 'this panel is built and its arithmetic is specified, but it is not yet reading '
            + 'chain {NET}. Nothing was computed for position <span class="mono">{ID}</span> '
            + '&mdash; and putting a number here would be exactly the invention the rest of '
            + 'this console refuses to make. Until it reads, use the LP panel, which does.';
          e.innerHTML = texto
            .replace('{NET}', net === '42161' ? 'Arbitrum (42161)' : 'Polygon (137)')
            .replace('{ID}', id ? id : '(none entered)');
        });
      })();
      