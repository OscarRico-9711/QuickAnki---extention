// Obtener todos los elementos con clase "accordion"
var acc = document.getElementsByClassName("accordion");

// Agregar evento click a cada elemento accordion
for (var i = 0; i < acc.length; i++) {
  acc[i].addEventListener("click", function() {
    var isActive = this.classList.contains("active_acc");
    
    // Cerrar todos los paneles abiertos
    var panels = document.getElementsByClassName("panel");
    for (var j = 0; j < panels.length; j++) {
      panels[j].style.maxHeight = null;
    }

    // Remover la clase "active_acc" de todos los acordeones
    var accordions = document.getElementsByClassName("accordion");
    for (var k = 0; k < accordions.length; k++) {
      accordions[k].classList.remove("active_acc");
    }

    // Si el acordeón no estaba activo previamente, abrirlo y resaltarlo
    if (!isActive) {
      // Cambiar clase "active_acc" para resaltar el elemento seleccionado
      this.classList.add("active_acc");

      // Mostrar el panel correspondiente con transición suave
      var panel = this.nextElementSibling;
      panel.style.maxHeight = panel.scrollHeight + "px";
    }
  });
}

// Obtener todos los enlaces del índice
const indexLinks = document.querySelectorAll('.indice li a');

// Agregar el evento click a cada enlace del índice
indexLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault(); // Evitar el comportamiento predeterminado del enlace

    const targetId = link.getAttribute('href'); // Obtener el ID del objetivo de desplazamiento
    const targetElement = document.querySelector(targetId); // Obtener el elemento objetivo

    if (targetElement) {
      const offsetTop = targetElement.offsetTop; // Obtener la posición superior del elemento objetivo
      window.scrollTo({
        top: offsetTop,
        behavior: 'smooth' // Hacer el desplazamiento suave
      });
    }
  });
});
