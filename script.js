const magazine = document.getElementById('magazine');
let rotation = -14;
let startX = 0;
let startRotation = rotation;
let dragging = false;

function render() {
  magazine.style.setProperty('--rotation', `${rotation}deg`);
}

function beginDrag(clientX) {
  dragging = true;
  startX = clientX;
  startRotation = rotation;
  magazine.setPointerCapture?.(event.pointerId);
}

magazine.addEventListener('pointerdown', (event) => {
  beginDrag(event.clientX);
});

window.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  rotation = startRotation + (event.clientX - startX) * 0.8;
  render();
});

window.addEventListener('pointerup', () => {
  dragging = false;
});

magazine.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') {
    rotation -= 12;
    render();
  }
  if (event.key === 'ArrowRight') {
    rotation += 12;
    render();
  }
});

render();
