// src/app/components/reportes/reportes.component.ts
import { Component, OnInit, AfterViewInit, ElementRef, inject, ChangeDetectorRef, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PedidoService, ProductoStats, CategoriaStats } from '../../services/pedido.service';
import { AuthService, UserProfile } from '../../services/auth.service';
import { Chart, registerables, ChartConfiguration, ChartData, ChartOptions, ChartType } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { Subscription } from 'rxjs';

Chart.register(...registerables);

declare var M: any;

export interface Pedido {
  sucursal_id: number;
  fecha_pedido: Date;
  pedido_id: string;
  producto: string;
  categoria: string;
  cantidad: number;
  total: number;
  username: string;
}

interface EstadisticasSucursal {
  totalVentas: number;
  totalPedidos: number;
  promedioVentaPorPedido: number;
  ventasPorCategoria: { [key: string]: number };
  ventasPorProducto: { [key: string]: number };
  ventasPorMes: { [key: string]: number };
}

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './reportes.component.html',
  styleUrls: ['./reportes.component.css']
})
export class ReportesComponent implements OnInit, AfterViewInit, OnDestroy {

  sucursalesDisponibles: number[] = [];
  sucursalSeleccionadaParaReporte: number | null = null;
  pedidosDelReporte: Pedido[] = [];
  cargandoReporte = false;
  errorReporte: string | null = null;

  currentUser: UserProfile | null = null;
  puedeSeleccionarSucursal = false;
  private authSubscription!: Subscription;

  estadisticas: EstadisticasSucursal | null = null;
  mostrarEstadisticas = false;

  // Propiedades para los filtros
  filtroProducto: string = '';
  filtroCategoria: string = '';
  filtroUsuario: string = '';
  ordenPrecio: string = ''; // 'asc', 'desc', o ''

  productosDisponibles: string[] = [];
  categoriasDisponibles: string[] = [];
  pedidosFiltrados: Pedido[] = []; // Nueva propiedad para los pedidos filtrados

  // Configuraciones para ng2-charts
  public chartVentasPorCategoria: ChartConfiguration<'doughnut'> = {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
          '#9966FF', '#FF9F40', '#E7E9ED', '#808080'
        ],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: 'Ventas por Categoría',
          font: { size: 16 }
        },
        legend: {
          position: 'bottom'
        }
      }
    }
  };

  public chartVentasPorProducto: ChartConfiguration<'bar'> = {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Ventas ($)',
        data: [],
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: 'Top 10 Productos más Vendidos',
          font: { size: 16 }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (value: any) {
              return '$' + value.toLocaleString();
            }
          }
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      }
    }
  };

  public chartVentasPorMes: ChartConfiguration<'line'> = {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Ventas ($)',
        data: [],
        borderColor: 'rgba(75, 192, 192, 1)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderWidth: 3,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: 'Evolución de Ventas por Mes',
          font: { size: 16 }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (value: any) {
              return '$' + value.toLocaleString();
            }
          }
        }
      }
    }
  };

  private pedidoService = inject(PedidoService);
  private authService = inject(AuthService);
  private elementRef = inject(ElementRef);
  private cdr = inject(ChangeDetectorRef);

  constructor() { }

  ngOnInit(): void {
    this.authSubscription = this.authService.currentUser$.subscribe((user: UserProfile | null) => {
      this.currentUser = user;
      this.determinarPermisosYCargar();
      this.cdr.detectChanges();
    });
  }

  ngAfterViewInit(): void {
    // La inicialización inicial se maneja en determinarPermisosYCargar/obtenerReporteYEstadisticas
    // No necesitamos una llamada aquí si los selects no están siempre visibles
    // Se deja el setTimeout por si hay algun select que aparece muy al principio
    // pero no esta directamente relacionado con la carga de datos.
    // this.initMaterializeSelects(); // Se remueve o comenta si no se necesita aquí.
  }

  ngOnDestroy(): void {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
    // Asegúrate de destruir cualquier instancia de Materialize si la componente se destruye
    this.destroyMaterializeSelects();
  }

  // Método para destruir instancias de selects de Materialize y limpiar sus elementos generados
  destroyMaterializeSelects() {
    const selectElems = this.elementRef.nativeElement.querySelectorAll('select');
    selectElems.forEach((elem: HTMLSelectElement) => {
      const instance = M.FormSelect.getInstance(elem);
      if (instance) {
        console.log(`Destroying Materialize select instance for ID: ${elem.id}`); // Para depuración
        instance.destroy(); // Destruye la instancia de Materialize

        // Después de destruir, Materialize debería eliminar los elementos que creó.
        // Sin embargo, si el problema persiste, podemos forzar una limpieza adicional.
        // A veces el div.select-wrapper y el ul.dropdown-content quedan.
        const parentWrapper = elem.closest('.select-wrapper');
        if (parentWrapper) {
          // El select-wrapper contiene el input.select-dropdown y el select original
          // Necesitamos sacar el select original de dentro del wrapper
          // y luego eliminar el wrapper.
          const originalSelect = parentWrapper.querySelector('select');
          if (originalSelect) {
            parentWrapper.parentNode?.insertBefore(originalSelect, parentWrapper);
          }
          parentWrapper.remove(); // Elimina el div.select-wrapper
        }

        // También elimina cualquier dropdown-content flotante que Materialize pudo haber creado
        // y que no haya sido limpiado por destroy().
        // Estos ULs pueden estar hermanos del select-wrapper o directamente en body.
        const dropdownContents = document.querySelectorAll(`.dropdown-content.select-dropdown`);
        dropdownContents.forEach(dropdown => {
          // Solo eliminamos si el dropdown parece estar asociado con un select que estamos limpiando
          // Esto puede ser un poco más complicado si tienes muchos selects.
          // Una forma sería buscar el id del select en el data-activates del dropdown.
          // Por simplicidad, si está duplicando, eliminamos todos los que tengan esta clase.
          // ¡CUIDADO! Esto podría afectar a otros Materialize selects si los hay en tu app globalmente.
          // Es mejor si tus selects tienen IDs únicos o una clase para identificarlos.
          if (dropdown.id && dropdown.id.includes(elem.id)) { // Busca por el ID del select original
            dropdown.remove();
          } else {
            // Si no tienen un ID que los vincule, podemos hacer una limpieza más genérica,
            // pero hay que ser más cuidadoso para no eliminar dropdowns válidos de otros componentes.
            // Para este caso, si solo tenemos selects dentro del componente y tienen IDs, la primera opción es mejor.
          }
        });
      }
    });
    console.log('Materialize selects cleaned up.'); // Para depuración
  }


  initMaterializeSelects() {
    // 1. Destruye cualquier instancia previa. ¡Esto es crucial!
    this.destroyMaterializeSelects();

    // 2. Forzar un ciclo de detección de cambios de Angular.
    // Esto asegura que Angular termine de actualizar el DOM después de la destrucción
    // y antes de que Materialize intente re-inicializar.
    this.cdr.detectChanges();

    // 3. Pequeño retardo para dar tiempo al navegador a procesar el DOM.
    // Esto es especialmente útil para elementos que aparecen/desaparecen con *ngIf.
    setTimeout(() => {
      // Selecciona todos los elementos <select> que Materialize necesita inicializar.
      // Ser explícitos con los IDs ayuda a evitar problemas si hay otros selects.
      const selectsToInit = [
        this.elementRef.nativeElement.querySelector('#sucursal_reporte_select'),
        this.elementRef.nativeElement.querySelector('#filtro_producto_select'),
        this.elementRef.nativeElement.querySelector('#filtro_categoria_select'),
        this.elementRef.nativeElement.querySelector('#orden_precio_select')
      ].filter(Boolean); // Filtra los elementos nulos si no están en el DOM (debido a *ngIf)

      if (selectsToInit.length) {
        console.log('Initializing Materialize selects:', selectsToInit.map((s: any) => s.id)); // Depuración
        M.FormSelect.init(selectsToInit);
        // Fuerza la detección de cambios después de la inicialización de Materialize
        this.cdr.detectChanges();
      }
    }, 100); // Puedes ajustar este tiempo si es necesario
  }

  determinarPermisosYCargar(): void {
    this.resetearEstadoReporte(); // Esto ya llama a initMaterializeSelects()

    if (this.currentUser) {
      if (this.currentUser.rol === 'admin' || (this.currentUser.rol === 'empleado' && this.currentUser.sucursal_asignada_id === null)) {
        this.puedeSeleccionarSucursal = true;
        this.cargarSucursalesParaFiltro(); // Esto también llama a initMaterializeSelects()
      } else if (this.currentUser.rol === 'empleado' && this.currentUser.sucursal_asignada_id !== null) {
        this.puedeSeleccionarSucursal = false;
        this.sucursalSeleccionadaParaReporte = this.currentUser.sucursal_asignada_id;
        this.sucursalesDisponibles = [this.currentUser.sucursal_asignada_id];
        this.obtenerReporteYEstadisticas(); // Esto también llama a initMaterializeSelects()
      } else {
        this.errorReporte = "No tienes los permisos necesarios para ver estos reportes o tu configuración de sucursal no es válida.";
        this.puedeSeleccionarSucursal = false;
      }
    } else {
      this.errorReporte = "Debes iniciar sesión para ver los reportes.";
      this.puedeSeleccionarSucursal = false;
    }
  }

  cargarSucursalesParaFiltro(): void {
    this.pedidoService.getSucursales().subscribe({
      next: (data) => {
        this.sucursalesDisponibles = data;
        this.cdr.detectChanges();
        this.initMaterializeSelects(); // Re-inicializar después de cargar las opciones
      },
      error: (err: any) => {
        console.error('Error al cargar sucursales para el filtro de reportes:', err);
        M.toast({ html: 'Error al cargar lista de sucursales.', classes: 'red rounded' });
        this.errorReporte = 'No se pudieron cargar las sucursales para el filtro.';
      }
    });
  }

  onSucursalParaReporteChange(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    const sucursalId = parseInt(selectElement.value, 10);

    if (this.puedeSeleccionarSucursal && !isNaN(sucursalId) && sucursalId) {
      this.sucursalSeleccionadaParaReporte = sucursalId;
      this.obtenerReporteYEstadisticas(); // Esto llama a initMaterializeSelects() internamente
    } else if (!sucursalId) {
      this.resetearEstadoReporte();
      this.errorReporte = "Por favor, selecciona una sucursal.";
    }
  }

  obtenerReporteYEstadisticas(): void {
    if (this.sucursalSeleccionadaParaReporte === null) {
      this.resetearEstadoReporte(); // Asegura que se limpien los estados y selects
      this.errorReporte = "Por favor, selecciona una sucursal.";
      return;
    }

    this.cargandoReporte = true;
    this.errorReporte = null;
    this.pedidosDelReporte = [];
    this.estadisticas = null;
    this.mostrarEstadisticas = false;

    this.pedidoService.getPedidosPorSucursal(this.sucursalSeleccionadaParaReporte).subscribe({
      next: (data: Pedido[]) => {
        this.pedidosDelReporte = data;
        this.pedidosFiltrados = [...data]; // Inicializa los pedidos filtrados con todos los pedidos
        this.extraerOpcionesDeFiltro(data); // Extrae opciones de filtro y llama a initMaterializeSelects()

        if (data.length === 0) {
          this.errorReporte = null;
        } else {
          this.estadisticas = this.calcularEstadisticas(data);
          this.mostrarEstadisticas = true;
          this.actualizarGraficas();
        }
        this.cargandoReporte = false;
        this.cdr.detectChanges();
        console.log(`Reporte cargado para sucursal ${this.sucursalSeleccionadaParaReporte}:`, data);
      },
      error: (err: any) => {
        console.error(`Error al cargar reporte para sucursal ${this.sucursalSeleccionadaParaReporte}:`, err);
        this.errorReporte = `Error al cargar el reporte para la sucursal ${this.sucursalSeleccionadaParaReporte}.`;
        this.cargandoReporte = false;
        this.resetearEstadoReporte(); // Asegura que se limpien los estados y selects
      }
    });
  }

  private calcularEstadisticas(pedidos: Pedido[]): EstadisticasSucursal {
    const totalVentas = pedidos.reduce((sum, pedido) => sum + Number(pedido.total), 0);
    const totalPedidos = pedidos.length;
    const promedioVentaPorPedido = totalPedidos > 0 ? totalVentas / totalPedidos : 0;

    const ventasPorCategoria: { [key: string]: number } = {};
    pedidos.forEach(pedido => {
      ventasPorCategoria[pedido.categoria] = (ventasPorCategoria[pedido.categoria] || 0) + Number(pedido.total);
    });

    const ventasPorProducto: { [key: string]: number } = {};
    pedidos.forEach(pedido => {
      ventasPorProducto[pedido.producto] = (ventasPorProducto[pedido.producto] || 0) + Number(pedido.total);
    });

    const ventasPorMes: { [key: string]: number } = {};
    pedidos.forEach(pedido => {
      const fecha = pedido.fecha_pedido instanceof Date ? pedido.fecha_pedido : new Date(pedido.fecha_pedido);
      const mesAnio = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
      ventasPorMes[mesAnio] = (ventasPorMes[mesAnio] || 0) + Number(pedido.total);
    });

    return {
      totalVentas,
      totalPedidos,
      promedioVentaPorPedido,
      ventasPorCategoria,
      ventasPorProducto,
      ventasPorMes
    };
  }

  private actualizarGraficas(): void {
    if (!this.estadisticas) return;

    // Actualizar gráfica de categorías
    const categorias = Object.keys(this.estadisticas.ventasPorCategoria);
    const ventasCategoria = Object.values(this.estadisticas.ventasPorCategoria);

    this.chartVentasPorCategoria.data.labels = categorias;
    this.chartVentasPorCategoria.data.datasets[0].data = ventasCategoria;

    // Actualizar gráfica de productos (Top 10)
    const productosOrdenados = Object.entries(this.estadisticas.ventasPorProducto)
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .slice(0, 10);

    const productos = productosOrdenados.map(([producto]) => producto);
    const ventasProducto = productosOrdenados.map(([, ventas]) => Number(ventas));

    this.chartVentasPorProducto.data.labels = productos;
    this.chartVentasPorProducto.data.datasets[0].data = ventasProducto;

    // Actualizar gráfica de ventas por mes
    const mesesOrdenados = Object.keys(this.estadisticas.ventasPorMes).sort();
    const ventasMes = mesesOrdenados.map(mes => Number(this.estadisticas!.ventasPorMes[mes]));
    const etiquetasMes = mesesOrdenados.map(mes => {
      const [año, mesNum] = mes.split('-');
      const fecha = new Date(parseInt(año), parseInt(mesNum) - 1);
      return fecha.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
    });

    this.chartVentasPorMes.data.labels = etiquetasMes;
    this.chartVentasPorMes.data.datasets[0].data = ventasMes;
  }

  // Nuevos métodos para el filtrado
  private extraerOpcionesDeFiltro(pedidos: Pedido[]): void {
    const productos = new Set<string>();
    const categorias = new Set<string>();

    pedidos.forEach(pedido => {
      productos.add(pedido.producto);
      categorias.add(pedido.categoria);
    });

    this.productosDisponibles = Array.from(productos).sort();
    this.categoriasDisponibles = Array.from(categorias).sort();

    // Re-inicializa Materialize selects después de actualizar las opciones
    this.initMaterializeSelects();
  }

  aplicarFiltrosYActualizar(): void {
    let pedidos = [...this.pedidosDelReporte]; // Copia los pedidos originales

    // Filtro por producto
    if (this.filtroProducto) {
      pedidos = pedidos.filter(pedido => pedido.producto === this.filtroProducto);
    }

    // Filtro por categoría
    if (this.filtroCategoria) {
      pedidos = pedidos.filter(pedido => pedido.categoria === this.filtroCategoria);
    }

    // Filtro por usuario (búsqueda parcial insensible a mayúsculas/minúsculas)
    if (this.filtroUsuario) {
      const searchTerm = this.filtroUsuario.toLowerCase();
      pedidos = pedidos.filter(pedido =>
        pedido.username.toLowerCase().includes(searchTerm)
      );
    }

    // Ordenar por precio
    if (this.ordenPrecio) {
      pedidos.sort((a, b) => {
        if (this.ordenPrecio === 'asc') {
          return Number(a.total) - Number(b.total);
        } else {
          return Number(b.total) - Number(a.total);
        }
      });
    }

    this.pedidosFiltrados = pedidos;
    this.cdr.detectChanges(); // Asegura que la vista se actualice
  }

  resetearEstadoReporte(): void {
    this.sucursalSeleccionadaParaReporte = null;
    this.pedidosDelReporte = [];
    this.estadisticas = null;
    this.mostrarEstadisticas = false;
    this.errorReporte = null;

    // Resetear filtros
    this.filtroProducto = '';
    this.filtroCategoria = '';
    this.filtroUsuario = '';
    this.ordenPrecio = '';
    this.productosDisponibles = [];
    this.categoriasDisponibles = [];
    this.pedidosFiltrados = [];

    // Llama a la inicialización, que se encargará de destruir y re-inicializar
    this.initMaterializeSelects();
  }
}