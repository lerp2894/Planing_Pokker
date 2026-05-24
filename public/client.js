// ... (código existente sin cambios hasta las constantes del DOM)

// Nuevas referencias
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const sidebar = document.getElementById('sidebar');

// ... (resto de constantes)

// Estado del sidebar en móvil
let sidebarVisible = true;

// Función para alternar el sidebar
toggleSidebarBtn.addEventListener('click', () => {
  sidebarVisible = !sidebarVisible;
  if (sidebarVisible) {
    sidebar.style.display = 'block';
    toggleSidebarBtn.textContent = '👥';
  } else {
    sidebar.style.display = 'none';
    toggleSidebarBtn.textContent = '👥'; // podría cambiarse a otro icono
  }
});

// En modo responsive, por defecto mostrar (se oculta con el botón)
// En escritorio siempre visible
function handleSidebarResponsive() {
  if (window.innerWidth <= 768) {
    toggleSidebarBtn.style.display = 'inline-block';
    // Si no hemos ocultado manualmente, mostrar
    if (sidebarVisible) {
      sidebar.style.display = 'block';
    }
  } else {
    toggleSidebarBtn.style.display = 'none';
    sidebar.style.display = 'block'; // siempre visible en escritorio
  }
}

window.addEventListener('resize', handleSidebarResponsive);
handleSidebarResponsive();

// ... (resto del código: socket, renderRoom, etc., igual que antes)

// Al unirse a sala, también llamamos a handleSidebarResponsive por si acaso
// (no es necesario, pero lo dejo)