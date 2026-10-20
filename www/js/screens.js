export function zeigeScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('aktiv'));
  const ziel = document.getElementById(id);
  if (!ziel) {
    console.error(`Screen "${id}" existiert nicht.`);
    return;
  }
  ziel.classList.add('aktiv');
  // Screens, deren Inhalt von zwischenzeitlichen Änderungen abhängt (z.B.
  // Schnellstart-Knöpfe nach einer Runde), können sich hierauf neu aufbauen.
  document.dispatchEvent(new CustomEvent('screen-gezeigt', { detail: { id } }));
}

export function initNavigation() {
  document.querySelectorAll('[data-ziel]').forEach(el => {
    el.addEventListener('click', () => zeigeScreen(el.dataset.ziel));
  });
}
