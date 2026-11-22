if (typeof DxfParser === 'undefined') {
    window.DxfParser = function () {
        this.parseSync = function (dxfString) {
            const lines = dxfString.split('\n').map(line => line.trim());
            const entities = [];
            let i = 0;
            while (i < lines.length) {
                if (lines[i] === '0' && lines[i + 1] === 'SECTION') {
                    i = this.parseSection(lines, i, entities);
                } else { i++; }
            }
            console.log('Entidades encontradas:', entities.length);
            return { entities: entities };
        };

        this.parseSection = function (lines, startIndex, entities) {
            let i = startIndex + 2;
            while (i < lines.length) {
                if (lines[i] === '0') {
                    if (lines[i + 1] === 'ENDSEC') return i + 2;
                    const entityType = lines[i + 1];
                    if (entityType === 'LINE') i = this.parseLine(lines, i + 2, entities);
                    else if (entityType === 'LWPOLYLINE') i = this.parseLWPolyline(lines, i + 2, entities);
                    else if (entityType === 'POLYLINE') i = this.parsePolyline(lines, i + 2, entities);
                    else if (entityType === 'CIRCLE') i = this.parseCircle(lines, i + 2, entities);
                    else if (entityType === 'ARC') i = this.parseArc(lines, i + 2, entities);
                    else if (entityType === 'TEXT' || entityType === 'MTEXT') i = this.parseText(lines, i + 2, entities, entityType);
                    else if (entityType === 'DIMENSION') i = this.skipDimension(lines, i + 2);
                    else i += 2;
                } else { i++; }
            }
            return i;
        };

        this.skipDimension = function (lines, startIndex) {
            let i = startIndex;
            while (i < lines.length && lines[i] !== '0') {
                i += 2;
            }
            return i;
        };

        this.parseLine = function (lines, startIndex, entities) {
            const entity = { type: 'LINE', vertices: [{}, {}] };
            let i = startIndex;
            while (i < lines.length && lines[i] !== '0') {
                const code = lines[i], value = lines[i + 1];
                if (code === '8') entity.layer = value;
                else if (code === '62') entity.color = parseInt(value);
                else if (code === '10') entity.vertices[0].x = parseFloat(value);
                else if (code === '20') entity.vertices[0].y = parseFloat(value);
                else if (code === '11') entity.vertices[1].x = parseFloat(value);
                else if (code === '21') entity.vertices[1].y = parseFloat(value);
                else if (code === '370') entity.lineweight = parseInt(value);
                i += 2;
            }
            if (entity.vertices[0].x !== undefined && entity.vertices[1].x !== undefined) {
                entities.push(entity);
            }
            return i;
        };

        this.parseLWPolyline = function (lines, startIndex, entities) {
            const entity = { type: 'LWPOLYLINE', vertices: [], bulges: [] };
            let i = startIndex, currentVertex = null, currentBulge = 0, closed = false;
            while (i < lines.length && lines[i] !== '0') {
                const code = lines[i], value = lines[i + 1];
                if (code === '8') entity.layer = value;
                else if (code === '62') entity.color = parseInt(value);
                else if (code === '370') entity.lineweight = parseInt(value);
                else if (code === '70') closed = (parseInt(value) & 1) === 1;
                else if (code === '10') {
                    if (currentVertex && currentVertex.x !== undefined && currentVertex.y !== undefined) {
                        entity.vertices.push(currentVertex);
                        entity.bulges.push(currentBulge);
                        currentBulge = 0;
                    }
                    currentVertex = { x: parseFloat(value) };
                }
                else if (code === '20') { if (currentVertex) currentVertex.y = parseFloat(value); }
                else if (code === '42') { currentBulge = parseFloat(value); }
                i += 2;
            }
            if (currentVertex && currentVertex.x !== undefined && currentVertex.y !== undefined) {
                entity.vertices.push(currentVertex);
                entity.bulges.push(currentBulge);
            }
            entity.closed = closed;
            if (entity.vertices.length > 0) {
                while (entity.bulges.length < entity.vertices.length) entity.bulges.push(0);
                entities.push(entity);
            }
            return i;
        };

        this.parsePolyline = function (lines, startIndex, entities) {
            const entity = { type: 'POLYLINE', vertices: [] };
            let i = startIndex, closed = false;
            while (i < lines.length && lines[i] !== '0') {
                const code = lines[i], value = lines[i + 1];
                if (code === '8') entity.layer = value;
                else if (code === '62') entity.color = parseInt(value);
                else if (code === '70') closed = (parseInt(value) & 1) === 1;
                else if (code === '370') entity.lineweight = parseInt(value);
                i += 2;
            }
            while (i < lines.length) {
                if (lines[i] === '0' && lines[i + 1] === 'VERTEX') {
                    const vertex = {};
                    i += 2;
                    while (i < lines.length && lines[i] !== '0') {
                        const code = lines[i], value = lines[i + 1];
                        if (code === '10') vertex.x = parseFloat(value);
                        else if (code === '20') vertex.y = parseFloat(value);
                        i += 2;
                    }
                    if (vertex.x !== undefined) entity.vertices.push(vertex);
                } else if (lines[i] === '0' && lines[i + 1] === 'SEQEND') {
                    i += 2; break;
                } else { i++; }
            }
            entity.closed = closed;
            if (entity.vertices.length > 0) entities.push(entity);
            return i;
        };

        this.parseCircle = function (lines, startIndex, entities) {
            const entity = { type: 'CIRCLE' };
            let i = startIndex;
            while (i < lines.length && lines[i] !== '0') {
                const code = lines[i], value = lines[i + 1];
                if (code === '8') entity.layer = value;
                else if (code === '62') entity.color = parseInt(value);
                else if (code === '10') entity.x = parseFloat(value);
                else if (code === '20') entity.y = parseFloat(value);
                else if (code === '40') entity.radius = parseFloat(value);
                else if (code === '370') entity.lineweight = parseInt(value);
                i += 2;
            }
            if (entity.x !== undefined && entity.radius !== undefined) entities.push(entity);
            return i;
        };

        this.parseArc = function (lines, startIndex, entities) {
            const entity = { type: 'ARC' };
            let i = startIndex;
            while (i < lines.length && lines[i] !== '0') {
                const code = lines[i], value = lines[i + 1];
                if (code === '8') entity.layer = value;
                else if (code === '62') entity.color = parseInt(value);
                else if (code === '10') entity.x = parseFloat(value);
                else if (code === '20') entity.y = parseFloat(value);
                else if (code === '40') entity.radius = parseFloat(value);
                else if (code === '50') entity.startAngle = parseFloat(value) * Math.PI / 180;
                else if (code === '51') entity.endAngle = parseFloat(value) * Math.PI / 180;
                else if (code === '370') entity.lineweight = parseInt(value);
                i += 2;
            }
            if (entity.x !== undefined && entity.radius !== undefined) entities.push(entity);
            return i;
        };

        this.parseText = function (lines, startIndex, entities, type) {
            const entity = { type: type };
            let i = startIndex;
            while (i < lines.length && lines[i] !== '0') {
                const code = lines[i], value = lines[i + 1];
                if (code === '8') entity.layer = value;
                else if (code === '62') entity.color = parseInt(value);
                else if (code === '10') entity.x = parseFloat(value);
                else if (code === '20') entity.y = parseFloat(value);
                else if (code === '11') entity.x2 = parseFloat(value);
                else if (code === '21') entity.y2 = parseFloat(value);
                else if (code === '1') entity.text = value;
                else if (code === '40') entity.height = parseFloat(value);
                else if (code === '50') entity.rotation = parseFloat(value);
                else if (code === '41') entity.widthFactor = parseFloat(value);
                else if (code === '7') entity.style = value;
                else if (code === '72') entity.halign = parseInt(value);
                else if (code === '73') entity.valign = parseInt(value);
                i += 2;
            }
            if (entity.x !== undefined && entity.text) {
                entity.position = { x: entity.x, y: entity.y };
                if (entity.x2 !== undefined && entity.y2 !== undefined) {
                    entity.position2 = { x: entity.x2, y: entity.y2 };
                }
                entities.push(entity);
            }
            return i;
        };
    };
}

// Variables globales
let map;
let dxfLayer;
let lotesLayer;
let manzanosLayer;
let selectedLote = null;
let manzanosData = {};
let lotesData = {};
let dxfData = null;
let allBounds = null;
let reservations = [];
let autoLoadAttempted = false;
let excelData = null;
let excelLoaded = false;
// Variables para la vista 3D
let scene3D, camera3D, renderer3D, controls3D;
let glbModel3D, dxfGroup3D;
let gridHelper3D, axesHelper3D;
let raycaster3D = new THREE.Raycaster();
let layers3D = {};
let originUTM3D = { x: 0, y: 0, z: 0 };
let hasOrigin3D = false;
let is3DViewActive = false;
let currentLayer = null; // Variable para la capa actual del mapa
// **AGREGAR ESTAS NUEVAS VARIABLES:**
let projectionCache3D = null; // Caché de proyecciones calculadas
let lastModelHash = null; // Hash del modelo para detectar cambios

// Inicialización
document.addEventListener('DOMContentLoaded', function () {
    // Verificar que los elementos necesarios existan antes de inicializar
    const mapViewer = document.getElementById('map-viewer');
    const sidebarContent = document.getElementById('sidebar-content');
    const scrollIndicator = document.getElementById('scroll-indicator');

    if (!mapViewer) {
        console.error('Elemento map-viewer no encontrado');
        return;
    }

    if (!sidebarContent || !scrollIndicator) {
        console.warn('Elementos de sidebar no encontrados, algunas funciones podrían no estar disponibles');
    }

    loadDefaultDXF();
    initMap();
    setupEventListeners();

    // Solo llamar a setupScrollBehavior si los elementos existen
    if (sidebarContent && scrollIndicator) {
        setupScrollBehavior();
    }

    // Inicializar la vista 3D (pero no mostrarla hasta que se solicite)
    init3D();
});


function loadDefaultDXF() {
    // Evitar múltiples intentos de carga
    if (window.autoLoadAttempted) return;
    window.autoLoadAttempted = true;

    console.log("Iniciando carga automática del archivo DXF...");

    // Establecer valores predeterminados para zona 19 sur
    const coordSystem = document.getElementById('coord-system');
    const utmZone = document.getElementById('utm-zone');
    const utmHemisphere = document.getElementById('utm-hemisphere');

    if (!coordSystem || !utmZone || !utmHemisphere) {
        console.error('Elementos del formulario no encontrados');
        return;
    }

    coordSystem.value = 'utm';
    utmZone.value = '18';
    utmHemisphere.value = 'north';

    // Mostrar los campos apropiados
    const elementsToShow = ['utm-zone-group', 'utm-hemisphere-group'];
    const elementsToHide = ['ref-lat-group', 'ref-lng-group', 'scale-group'];

    elementsToShow.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'block';
    });

    elementsToHide.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Mostrar indicador de carga
    const loadingEl = document.getElementById('loading');
    const loadingText = document.querySelector('.loading-text');

    if (loadingEl) loadingEl.classList.add('active');
    if (loadingText) loadingText.textContent = 'Cargando plano urbanización...';

    // Intentar cargar el archivo DXF
    const dxfPath = 'img/dxf/LOTEO.dxf';

    // Añadir manejo de errores más específico
    fetch(dxfPath)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
            }
            return response.text();
        })
        .then(dxfText => {
            console.log("Archivo DXF cargado exitosamente");

            // Verificar que el texto no esté vacío
            if (!dxfText || dxfText.trim().length === 0) {
                throw new Error('El archivo DXF está vacío');
            }

            // Verificar que DxfParser esté disponible
            if (typeof DxfParser === 'undefined') {
                throw new Error('La librería DXF Parser no está cargada');
            }

            const parser = new DxfParser();
            const parsedData = parser.parseSync(dxfText);

            // Validar que el parseo fue exitoso
            if (!parsedData || !parsedData.entities) {
                throw new Error('El archivo DXF no contiene datos válidos');
            }

            console.log("Archivo DXF parseado exitosamente");
            console.log(`Entidades encontradas: ${parsedData.entities.length}`);

            // Guardar en variable global si es necesario
            if (typeof window.dxfData !== 'undefined') {
                window.dxfData = parsedData;
            }

            // Procesar el archivo DXF con manejo de errores
            try {
                processDXF(parsedData);
            } catch (error) {
                console.error('Error procesando DXF:', error);
                //showNotification('Error al procesar el archivo DXF: ' + error.message, 'error');
            }

            if (loadingEl) loadingEl.classList.remove('active');
            // showNotification('Archivo DXF cargado automáticamente', 'success');

            // DESPUÉS DE CARGAR EL DXF, CARGAR EL EXCEL Y EL MODELO 3D AUTOMÁTICAMENTE
            setTimeout(() => {
                loadDefaultExcel();
                loadDefaultGLB();
            }, 1000);
        })
        .catch(error => {
            console.error('Error en la carga automática del DXF:', error);

            if (loadingEl) loadingEl.classList.remove('active');

            // Mensaje más específico según el tipo de error
            let errorMessage = 'No se pudo cargar el archivo DXF. ';

            if (error.message.includes('HTTP')) {
                errorMessage += 'Verifica que el archivo existe';
            } else if (error.message.includes('Parser')) {
                errorMessage += 'Asegúrate de que la librería DXF Parser está incluida.';
            } else if (error.message.includes('válidos')) {
                errorMessage += 'El archivo parece estar corrupto o vacío.';
            } else {
            }

            showNotification(errorMessage, 'error');
        });
}

function loadDefaultExcel() {
    console.log("Iniciando carga automática del archivo Excel...");

    // Verificar que los lotes estén cargados
    if (Object.keys(lotesData).length === 0) {
        console.warn('No hay lotes cargados. No se puede procesar el Excel.');
        showNotification('Primero debes cargar el archivo DXF', 'error');
        return;
    }

    const loadingEl = document.getElementById('loading');
    const loadingText = document.querySelector('.loading-text');

    if (loadingEl) loadingEl.classList.add('active');
    if (loadingText) loadingText.textContent = 'Cargando datos de Excel...';

    const excelPath = 'img/DATOS.xlsx';

    fetch(excelPath)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
            }
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            console.log("Archivo Excel cargado exitosamente");

            // Verificar que XLSX esté disponible
            if (typeof XLSX === 'undefined') {
                throw new Error('La librería SheetJS (XLSX) no está cargada');
            }

            const data = new Uint8Array(arrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });

            // Tomar la primera hoja
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Convertir a array de arrays
            excelData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            console.log("Archivo Excel parseado exitosamente");
            console.log(`Filas encontradas: ${excelData.length}`);

            // Establecer configuración por defecto
            document.getElementById('header-row').value = '1';
            document.getElementById('lote-code-column').value = 'A';
            document.getElementById('price-column').value = 'D';
            document.getElementById('status-column').value = 'E';

            // Procesar automáticamente el Excel
            processExcelFileAutomatic();
        })
        .catch(error => {
            console.error('Error en la carga automática del Excel:', error);

            if (loadingEl) loadingEl.classList.remove('active');

            if (error.message.includes('HTTP')) {
                errorMessage += 'Verifica que el archivo existe en img/DATOS.xlsx';
            } else if (error.message.includes('XLSX')) {
                errorMessage += 'Asegúrate de que la librería SheetJS está incluida.';
            } else {
            }

            showNotification(errorMessage, 'info');
        });
}


function loadDefaultGLB() {
    console.log("Iniciando carga automática de múltiples modelos GLB...");

    const loadingEl = document.getElementById('loading');
    const loadingText = document.querySelector('.loading-text');

    if (loadingEl) loadingEl.classList.add('active');

    // Array con las rutas de los 38 modelos a cargar
    const glbPaths = [];
    for (let i = 1; i <= 16; i++) {
        glbPaths.push(`img/MODELO${i}.GLB`);
    }

    // Array para almacenar los modelos cargados
    let modelsLoaded = 0;
    let errors = [];
    let globalOriginUTM = null; // Origen común para todos los modelos

    // Función para cargar un modelo individual
    function loadSingleModel(glbPath, index) {
        return fetch(glbPath)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
                }
                return response.arrayBuffer();
            })
            .then(arrayBuffer => {
                // Verificar que el arrayBuffer tenga contenido válido
                if (!arrayBuffer || arrayBuffer.byteLength < 20) {
                    throw new Error(`Archivo inválido o vacío (${arrayBuffer ? arrayBuffer.byteLength : 0} bytes)`);
                }

                console.log(`${glbPath} descargado: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`);

                // Verificar que THREE.GLTFLoader esté disponible
                if (typeof THREE === 'undefined' || !THREE.GLTFLoader) {
                    throw new Error('La librería THREE.js o GLTFLoader no está cargada');
                }

                return new Promise((resolve, reject) => {
                    const loader = new THREE.GLTFLoader();

                    // IMPORTANTE: Pasar el path correcto como segundo parámetro
                    loader.parse(arrayBuffer, 'img/', function (gltf) {
                        const model = gltf.scene;
                        model.name = `Modelo_${index + 1}`;
                        model.userData.modelIndex = index + 1;

                        // Calcular el bounding box original DEL MODELO
                        const bbox = new THREE.Box3().setFromObject(model);
                        const center = bbox.getCenter(new THREE.Vector3());
                        const size = bbox.getSize(new THREE.Vector3());

                        console.log(`Modelo ${index + 1} - Centro: X=${center.x.toFixed(2)}, Y=${center.y.toFixed(2)}, Z=${center.z.toFixed(2)}`);

                        // Detectar si usa coordenadas UTM (valores grandes)
                        if (Math.abs(center.x) > 10000 || Math.abs(center.z) > 10000) {

                            // Guardar el origen UTM del primer modelo como referencia global
                            if (index === 0 && globalOriginUTM === null) {
                                globalOriginUTM = {
                                    x: Math.round(center.x),
                                    y: Math.round(center.y),
                                    z: Math.round(center.z)
                                };
                                originUTM3D.x = globalOriginUTM.x;
                                originUTM3D.y = globalOriginUTM.y;
                                originUTM3D.z = -globalOriginUTM.z;
                                hasOrigin3D = true;
                                console.log('✓ Origen UTM global:', globalOriginUTM);
                            }

                            // Calcular el offset relativo al origen global
                            const offsetX = center.x - globalOriginUTM.x;
                            const offsetY = center.y - globalOriginUTM.y;
                            const offsetZ = center.z - globalOriginUTM.z;

                            // Recentrar el modelo respecto al origen GLOBAL
                            model.traverse((child) => {
                                if (child.isMesh && child.geometry) {
                                    const geometry = child.geometry;

                                    // Aplicar transformación del objeto a la geometría
                                    child.updateMatrixWorld(true);
                                    geometry.applyMatrix4(child.matrixWorld);

                                    // Trasladar vértices al origen GLOBAL
                                    const positions = geometry.attributes.position;
                                    for (let i = 0; i < positions.count; i++) {
                                        positions.setX(i, positions.getX(i) - globalOriginUTM.x);
                                        positions.setY(i, positions.getY(i) - globalOriginUTM.y);
                                        positions.setZ(i, positions.getZ(i) - globalOriginUTM.z);
                                    }

                                    positions.needsUpdate = true;
                                    geometry.computeBoundingBox();
                                    geometry.computeBoundingSphere();

                                    // Resetear transformaciones del objeto
                                    child.position.set(0, 0, 0);
                                    child.rotation.set(0, 0, 0);
                                    child.scale.set(1, 1, 1);
                                    child.updateMatrix();
                                    child.matrixAutoUpdate = true;
                                }
                            });

                            model.position.set(0, 0, 0);
                            model.rotation.set(0, 0, 0);
                            model.scale.set(1, 1, 1);

                        } else {
                            model.position.set(0, 0, 0);
                            if (index === 0) hasOrigin3D = false;
                        }

                        // Configurar sombras y materiales
                        model.traverse((child) => {
                            if (child.isMesh) {
                                child.castShadow = true;
                                child.receiveShadow = true;

                                if (child.material) {
                                    child.material.needsUpdate = true;
                                    if (child.material.map) {
                                        child.material.map.encoding = THREE.sRGBEncoding;
                                    }
                                }
                            }
                        });

                        console.log(`✓ Modelo ${index + 1} procesado correctamente`);
                        resolve(model);

                    }, function (error) {
                        reject(new Error(`Error en GLTFLoader.parse: ${error.message || error}`));
                    });
                });
            })
            .catch(error => {
                console.error(`✗ Error en ${glbPath}:`, error.message);
                errors.push({ path: glbPath, error: error.message, index: index + 1 });
                return null;
            });
    }

    // Cargar todos los modelos en SECUENCIA
    async function loadAllModels() {
        const models = [];

        for (let i = 0; i < glbPaths.length; i++) {
            if (loadingText) {
                loadingText.textContent = `Cargando modelo ${i + 1} de ${glbPaths.length}...`;
            }

            const model = await loadSingleModel(glbPaths[i], i);
            models.push(model);

            // Pequeña pausa para no saturar el navegador
            if (i % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        return models;
    }

    loadAllModels()
        .then(models => {
            // Remover modelos anteriores si existen
            if (glbModel3D) {
                scene3D.remove(glbModel3D);
            }

            // Crear un grupo para contener todos los modelos
            const modelGroup = new THREE.Group();
            modelGroup.name = 'ModelosGrupo';

            // Agregar modelos válidos al grupo
            models.forEach(model => {
                if (model !== null) {
                    modelGroup.add(model);
                    modelsLoaded++;
                }
            });

            if (modelsLoaded > 0) {
                glbModel3D = modelGroup;
                scene3D.add(glbModel3D);

                // Calcular bounding box del grupo completo
                const groupBbox = new THREE.Box3().setFromObject(glbModel3D);
                const groupCenter = groupBbox.getCenter(new THREE.Vector3());
                const groupSize = groupBbox.getSize(new THREE.Vector3());

                console.log('═══════════════════════════════════');
                console.log(`✓ ${modelsLoaded} modelos cargados correctamente`);
                if (errors.length > 0) {
                    console.log(`✗ ${errors.length} modelos con errores:`);
                    errors.forEach(err => console.log(`  - Modelo ${err.index}: ${err.error}`));
                }
                console.log('═══════════════════════════════════');

                // Posicionar cámara
                const maxDim = Math.max(groupSize.x, groupSize.y, groupSize.z);
                const fov = camera3D.fov * (Math.PI / 180);
                let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
                cameraZ *= 2;

                camera3D.position.set(groupCenter.x + cameraZ, groupCenter.y + cameraZ / 2, groupCenter.z + cameraZ);
                camera3D.lookAt(groupCenter);
                controls3D.target.copy(groupCenter);
                controls3D.update();

                if (loadingEl) loadingEl.classList.remove('active');

                let message = `${modelsLoaded} de ${glbPaths.length} modelos cargados`;
                showNotification(message, modelsLoaded > 0 ? 'success' : 'warning');

                // Procesar lotes en 3D si ya están cargados
                if (Object.keys(lotesData).length > 0) {
                    projectionCache3D = null;
                    lastModelHash = null;

                    requestAnimationFrame(() => {
                        console.log('Procesando lotes en 3D después de carga automática...');
                    });
                }
            } else {
                if (loadingEl) loadingEl.classList.remove('active');
            }
        })
        .catch(error => {
            console.error('Error general en la carga de modelos:', error);
            if (loadingEl) loadingEl.classList.remove('active');
        });
}


function processExcelFileAutomatic() {
    if (!excelData) return;

    try {
        // Obtener configuración de columnas (valores por defecto)
        const loteCodeColumn = 'A';
        const priceColumn = 'D';
        const statusColumn = 'E';
        const headerRow = 0; // Primera fila (índice 0)

        // Convertir letras de columna a índices numéricos
        const colToIndex = (col) => {
            let index = 0;
            for (let i = 0; i < col.length; i++) {
                index = index * 26 + (col.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
            }
            return index - 1;
        };

        const loteCodeIndex = colToIndex(loteCodeColumn);
        const priceIndex = colToIndex(priceColumn);
        const statusIndex = colToIndex(statusColumn);

        // Procesar datos del Excel
        const excelLotesData = {};

        for (let i = headerRow + 1; i < excelData.length; i++) {
            const row = excelData[i];
            if (!row || row.length <= Math.max(loteCodeIndex, priceIndex, statusIndex)) continue;

            const loteCode = row[loteCodeIndex];
            const price = parseFloat(row[priceIndex]) || 0;
            const status = row[statusIndex] ? row[statusIndex].toString().toLowerCase() : 'disponible';

            if (!loteCode) continue;

            // Normalizar el estado
            let normalizedStatus = 'available';
            if (status.includes('reserv')) {
                normalizedStatus = 'reserved';
            } else if (status.includes('vend')) {
                normalizedStatus = 'sold';
            }

            excelLotesData[loteCode.toString().trim()] = {
                price: price,
                status: normalizedStatus
            };
        }

        // Función para normalizar nombres de lotes para comparación
        const normalizeLoteName = (name) => {
            return name.toString()
                .toUpperCase()
                .replace(/\s+/g, ' ')
                .trim();
        };

        // Aplicar datos del Excel a los lotes
        let updatedCount = 0;
        let notFoundCount = 0;
        const notFoundLotes = [];

        Object.keys(lotesData).forEach(loteName => {
            const normalizedLoteName = normalizeLoteName(loteName);

            // Buscar coincidencia en el Excel
            let found = false;
            for (const excelCode in excelLotesData) {
                const normalizedExcelCode = normalizeLoteName(excelCode);

                if (normalizedLoteName === normalizedExcelCode) {
                    lotesData[loteName].price = excelLotesData[excelCode].price;
                    lotesData[loteName].status = excelLotesData[excelCode].status;
                    updateLoteStyle(lotesData[loteName]);
                    updatedCount++;
                    found = true;
                    break;
                }
            }

            if (!found) {
                notFoundCount++;
                notFoundLotes.push(loteName);
            }
        });

        excelLoaded = true;
        updateStatistics();

        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.classList.remove('active');

        if (updatedCount > 0) {
            //showNotification(`Datos cargados: ${updatedCount} lotes actualizados automáticamente`, 'success');

            if (notFoundCount > 0) {
                console.warn(`${notFoundCount} lotes del DXF no se encontraron en el Excel:`, notFoundLotes);
            }
        } else {
            showNotification('No se encontraron coincidencias entre el DXF y el Excel', 'error');
            console.log('Lotes en DXF:', Object.keys(lotesData));
            console.log('Códigos en Excel:', Object.keys(excelLotesData));
        }

        // Si hay un lote seleccionado, actualizar su vista
        if (selectedLote) {
            showLoteDetails(selectedLote);
        }

    } catch (error) {
        console.error('Error procesando Excel automático:', error);
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.classList.remove('active');
        showNotification('Error al procesar el archivo Excel automáticamente', 'error');
    }
}

function initMap() {
    map = L.map('map-viewer', {
        center: [-21.5355, -63.6714],
        zoom: 50,
        zoomControl: false,
        maxZoom: 50,
        minZoom: 3
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 22,
        maxNativeZoom: 19
    });

    // FIX: {s} corregido para rotar entre subdominios (antes iba fijo a mt1)
    const satelliteLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        attribution: '© Google Maps',
        maxZoom: 22,
        maxNativeZoom: 21,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        keepBuffer: 4,          // pre-carga más tiles alrededor -> menos "parches" en blanco al mover
        updateWhenZooming: false // evita parpadeo/pixelado feo mientras se hace zoom
    });

    // NUEVA: híbrida = satélite + nombres de vías, ríos, lugares (más "atractiva" y útil)
    const hybridLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        attribution: '© Google Maps',
        maxZoom: 22,
        maxNativeZoom: 21,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        keepBuffer: 4,
        updateWhenZooming: false
    });

    // ALTERNATIVA: Esri World Imagery, a veces con mejor resolución en zonas rurales/costeras
    const esriLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri',
        maxZoom: 20,
        maxNativeZoom: 19,
        keepBuffer: 4
    });

    const terrainLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenTopoMap',
        maxZoom: 17
    });

    hybridLayer.addTo(map);
    let currentLayer = hybridLayer;

    manzanosLayer = L.featureGroup().addTo(map);
    lotesLayer = L.featureGroup().addTo(map);
    dxfLayer = L.featureGroup().addTo(map);

    manzanosLayer.setZIndex(100);
    lotesLayer.setZIndex(200);
    dxfLayer.setZIndex(50);

    document.querySelectorAll('.view-button').forEach(button => {
        button.addEventListener('click', function () {
            document.querySelectorAll('.view-button').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const view = this.getAttribute('data-view');
            if (map.hasLayer(currentLayer)) map.removeLayer(currentLayer);
            if (view === 'map') currentLayer = osmLayer;
            else if (view === 'satellite') currentLayer = hybridLayer; // <- usa híbrida por defecto
            else if (view === 'terrain') currentLayer = terrainLayer;
            map.addLayer(currentLayer);
        });
    });

    map.on('mousemove', function (e) {
        document.querySelector('.coordinates').textContent =
            `Lat: ${e.latlng.lat.toFixed(4)}, Lng: ${e.latlng.lng.toFixed(4)}`;
    });
}




function init3D() {
    const container = document.getElementById('viewer-3d');
    const canvas = document.getElementById('canvas-3d');

    scene3D = new THREE.Scene();
    scene3D.background = new THREE.Color(0x1a1a2e);

    camera3D = new THREE.PerspectiveCamera(
        60,
        container.clientWidth / container.clientHeight,
        0.01,
        10000
    );
    camera3D.position.set(100, 100, 100);

    renderer3D = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        logarithmicDepthBuffer: true,
        precision: 'highp'
    });
    renderer3D.setSize(container.clientWidth, container.clientHeight);
    renderer3D.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer3D.shadowMap.enabled = true;
    renderer3D.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer3D.outputEncoding = THREE.sRGBEncoding;

    controls3D = new THREE.OrbitControls(camera3D, renderer3D.domElement);
    controls3D.enableDamping = true;
    controls3D.dampingFactor = 0.05;
    controls3D.screenSpacePanning = true;
    controls3D.minDistance = 1;
    controls3D.maxDistance = 500;

    // Iluminación
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene3D.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 100, 50);
    dirLight.castShadow = true;
    scene3D.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-100, 50, -50);
    scene3D.add(dirLight2);

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x8B7355, 0.5);
    scene3D.add(hemisphereLight);

    // Grid y ejes (ocultos por defecto)
    gridHelper3D = new THREE.GridHelper(500, 50, 0x00ff00, 0x444444);
    gridHelper3D.visible = false; // Oculto por defecto
    scene3D.add(gridHelper3D);

    axesHelper3D = new THREE.AxesHelper(100);
    axesHelper3D.visible = false; // Oculto por defecto
    scene3D.add(axesHelper3D);

    // Event listeners (botones removidos)
    window.addEventListener('resize', onWindowResize3D);
    document.getElementById('reset-camera-3d').addEventListener('click', resetCamera3D);
    document.getElementById('take-screenshot-3d').addEventListener('click', takeScreenshot3D);
    document.getElementById('toggle-controls-3d').addEventListener('click', toggleControls3D);

    animate3D();

    // Event listeners para clics y hover en el canvas 3D
    canvas.addEventListener('click', onCanvas3DClick);
    canvas.addEventListener('mousemove', onCanvas3DMouseMove);
}

function onCanvas3DClick(event) {
    if (!is3DViewActive || !dxfGroup3D) return;

    const canvas = document.getElementById('canvas-3d');
    const rect = canvas.getBoundingClientRect();

    // Calcular coordenadas del mouse normalizadas (-1 a +1)
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Configurar raycaster desde la cámara
    raycaster3D.setFromCamera(mouse, camera3D);

    // Detectar intersecciones con los objetos del grupo DXF
    const intersects = raycaster3D.intersectObjects(dxfGroup3D.children, true);

    if (intersects.length > 0) {
        // Buscar el primer objeto que tenga userData.loteName
        for (let i = 0; i < intersects.length; i++) {
            const object = intersects[i].object;

            if (object.userData && object.userData.loteName) {
                const loteName = object.userData.loteName;
                console.log('Lote seleccionado en 3D:', loteName);

                // Llamar a la función existente que muestra detalles del lote
                selectLote(loteName);

                // Resaltar el lote en 3D
                highlightLoteIn3D(loteName);

                break;
            }
        }
    }
}


function highlightLoteIn3D(selectedLoteName) {
    if (!dxfGroup3D) return;

    // Restaurar todos los lotes a su estado normal
    dxfGroup3D.traverse((child) => {
        if (child.userData && child.userData.loteName) {
            if (child.userData.type === 'border') {
                // Restaurar color original del borde
                const lote = lotesData[child.userData.loteName];
                if (lote) {
                    let color;
                    if (lote.status === 'available') {
                        color = new THREE.Color(0x10b981);
                    } else if (lote.status === 'reserved') {
                        color = new THREE.Color(0xf59e0b);
                    } else if (lote.status === 'sold') {
                        color = new THREE.Color(0xef4444);
                    } else {
                        color = new THREE.Color(0x8B4513);
                    }

                    if (child.material) {
                        child.material.color = color;
                        child.material.emissive = new THREE.Color(0x000000);
                    }
                }
            }

            if (child.userData.type === 'label') {
                // Restaurar escala original
                child.scale.set(5, 5, 1);
            }
        }
    });

    // Resaltar el lote seleccionado
    dxfGroup3D.traverse((child) => {
        if (child.userData && child.userData.loteName === selectedLoteName) {
            if (child.userData.type === 'border') {
                // Hacer el borde más brillante y grueso
                if (child.material) {
                    child.material.emissive = new THREE.Color(0xffffff);
                    child.material.emissiveIntensity = 0.5;
                }
            }

            if (child.userData.type === 'label') {
                // Hacer el número más grande
                child.scale.set(7, 7, 1);
            }
        }
    });

    console.log('Lote resaltado en 3D:', selectedLoteName);
}


function onCanvas3DMouseMove(event) {
    if (!is3DViewActive || !dxfGroup3D) return;

    const canvas = document.getElementById('canvas-3d');
    const rect = canvas.getBoundingClientRect();

    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster3D.setFromCamera(mouse, camera3D);
    const intersects = raycaster3D.intersectObjects(dxfGroup3D.children, true);

    let overLote = false;

    if (intersects.length > 0) {
        for (let i = 0; i < intersects.length; i++) {
            if (intersects[i].object.userData && intersects[i].object.userData.loteName) {
                overLote = true;
                break;
            }
        }
    }

    canvas.style.cursor = overLote ? 'pointer' : 'default';
}

function onWindowResize3D() {
    const container = document.getElementById('viewer-3d');
    camera3D.aspect = container.clientWidth / container.clientHeight;
    camera3D.updateProjectionMatrix();
    renderer3D.setSize(container.clientWidth, container.clientHeight);
}

function animate3D() {
    requestAnimationFrame(animate3D);
    controls3D.update();

    // Actualizar coordenadas
    updateCoordinates3D();

    renderer3D.render(scene3D, camera3D);
}

function updateCoordinates3D() {
    if (is3DViewActive) {
        const coordsElement = document.querySelector('.coordinates-3d');
        if (coordsElement) {
            // Mostrar posición de la cámara
            coordsElement.textContent = `X: ${camera3D.position.x.toFixed(2)}, Y: ${camera3D.position.y.toFixed(2)}, Z: ${camera3D.position.z.toFixed(2)}`;
        }
    }
}

function toggleControls3D() {
    const controls = document.querySelector('.controls-3d');
    if (controls.style.display === 'none') {
        controls.style.display = 'block';
    } else {
        controls.style.display = 'none';
    }
}

function toggleGrid3D() {
    gridHelper3D.visible = !gridHelper3D.visible;
}

function toggleAxes3D() {
    axesHelper3D.visible = !axesHelper3D.visible;
}

function resetCamera3D() {
    if (glbModel3D) {
        const box = new THREE.Box3().setFromObject(glbModel3D);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera3D.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 2;

        camera3D.position.set(center.x + cameraZ, center.y + cameraZ / 2, center.z + cameraZ);
        camera3D.lookAt(center);
        controls3D.target.copy(center);
        controls3D.update();
    }
}

function takeScreenshot3D() {
    renderer3D.render(scene3D, camera3D);
    const screenshot = renderer3D.domElement.toDataURL('image/png');

    const link = document.createElement('a');
    link.download = `captura_3d_${Date.now()}.png`;
    link.href = screenshot;
    link.click();

    showNotification('Captura guardada correctamente', 'success');
}

function loadGLB3D(event) {
    const file = event.target.files[0];
    if (!file) return;

    showNotification('Cargando modelo 3D...', 'info');

    const reader = new FileReader();
    reader.onload = function (e) {
        const loader = new THREE.GLTFLoader();

        loader.parse(e.target.result, '', function (gltf) {
            if (glbModel3D) {
                scene3D.remove(glbModel3D);
            }

            glbModel3D = gltf.scene;

            // Calcular el bounding box original
            const bbox = new THREE.Box3().setFromObject(glbModel3D);
            const center = bbox.getCenter(new THREE.Vector3());
            const size = bbox.getSize(new THREE.Vector3());

            // Detectar si usa coordenadas UTM (valores grandes)
            if (Math.abs(center.x) > 10000 || Math.abs(center.z) > 10000) {
                // Guardar el origen UTM para referencia
                originUTM3D.x = Math.round(center.x);
                originUTM3D.y = Math.round(center.y);
                originUTM3D.z = Math.round(-center.z); // Z invertido
                hasOrigin3D = true;

                console.log('Origen UTM detectado:', originUTM3D);

                // Recentrar el modelo al origen (0,0,0)
                glbModel3D.traverse((child) => {
                    if (child.isMesh && child.geometry) {
                        const geometry = child.geometry;

                        // Aplicar transformación del objeto a la geometría
                        child.updateMatrixWorld(true);
                        geometry.applyMatrix4(child.matrixWorld);

                        // Trasladar vértices al origen
                        const positions = geometry.attributes.position;
                        for (let i = 0; i < positions.count; i++) {
                            positions.setX(i, positions.getX(i) - center.x);
                            positions.setY(i, positions.getY(i) - center.y);
                            positions.setZ(i, positions.getZ(i) - center.z);
                        }

                        positions.needsUpdate = true;
                        geometry.computeBoundingBox();
                        geometry.computeBoundingSphere();

                        // Resetear transformaciones del objeto
                        child.position.set(0, 0, 0);
                        child.rotation.set(0, 0, 0);
                        child.scale.set(1, 1, 1);
                        child.updateMatrix();
                        child.matrixAutoUpdate = true;
                    }
                });

                glbModel3D.position.set(0, 0, 0);
                glbModel3D.rotation.set(0, 0, 0);
                glbModel3D.scale.set(1, 1, 1);
            } else {
                glbModel3D.position.set(0, 0, 0);
                hasOrigin3D = false;
            }

            // Configurar sombras y materiales
            glbModel3D.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    if (child.material) {
                        child.material.needsUpdate = true;
                        if (child.material.map) {
                            child.material.map.encoding = THREE.sRGBEncoding;
                        }
                    }
                }
            });

            scene3D.add(glbModel3D);

            // Calcular nuevo bounding box después de recentrar
            const newBbox = new THREE.Box3().setFromObject(glbModel3D);
            const newCenter = newBbox.getCenter(new THREE.Vector3());
            const newSize = newBbox.getSize(new THREE.Vector3());

            // Posicionar cámara
            const maxDim = Math.max(newSize.x, newSize.y, newSize.z);
            const fov = camera3D.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
            cameraZ *= 2;

            camera3D.position.set(newCenter.x + cameraZ, newCenter.y + cameraZ / 2, newCenter.z + cameraZ);
            camera3D.lookAt(newCenter);
            controls3D.target.copy(newCenter);
            controls3D.update();

            showNotification('Modelo 3D cargado correctamente', 'success');

            // IMPORTANTE: Procesar lotes en 3D si ya están cargados
            if (Object.keys(lotesData).length > 0) {
                // Invalidar caché al cargar nuevo modelo
                projectionCache3D = null;
                lastModelHash = null;

                // Esperar un frame para asegurar que el modelo esté completamente cargado
                requestAnimationFrame(() => {
                    processLotesIn3D();
                });
            }

        }, function (error) {
            showNotification('Error al cargar modelo 3D: ' + error.message, 'error');
            console.error(error);
        });
    };

    reader.readAsArrayBuffer(file);
}



function setupEventListeners() {
    // Modal DXF
    document.getElementById('modal-close').addEventListener('click', hideDxfModal);
    document.getElementById('cancel-button').addEventListener('click', hideDxfModal);

    // Control para cambiar entre UTM y Lat/Lng
    document.getElementById('coord-system').addEventListener('change', function () {
        const isUTM = this.value === 'utm';
        document.getElementById('utm-zone-group').style.display = isUTM ? 'block' : 'none';
        document.getElementById('utm-hemisphere-group').style.display = isUTM ? 'block' : 'none';
        document.getElementById('ref-lat-group').style.display = isUTM ? 'none' : 'block';
        document.getElementById('ref-lng-group').style.display = isUTM ? 'none' : 'block';
        document.getElementById('scale-group').style.display = isUTM ? 'none' : 'block';
    });

    // File upload
    const fileUploadArea = document.getElementById('file-upload-area');
    const fileInput = document.getElementById('file-input');

    fileUploadArea.addEventListener('click', () => fileInput.click());
    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadArea.classList.add('dragover');
    });
    fileUploadArea.addEventListener('dragleave', () => fileUploadArea.classList.remove('dragover'));
    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
    });



    // Botón de procesar DXF
    document.getElementById('process-button').addEventListener('click', processDxfFile);

    // Botones de herramientas
    document.getElementById('zoom-in-tool').addEventListener('click', () => map.zoomIn());
    document.getElementById('zoom-out-tool').addEventListener('click', () => map.zoomOut());

    // Botón de pantalla completa
    const fullscreenBtn = document.getElementById('fullscreen-tool');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', function () {
            const elem = document.documentElement;
            if (!document.fullscreenElement) {
                if (elem.requestFullscreen) {
                    elem.requestFullscreen();
                } else if (elem.webkitRequestFullscreen) { // Safari
                    elem.webkitRequestFullscreen();
                } else if (elem.msRequestFullscreen) { // IE11
                    elem.msRequestFullscreen();
                }
                this.innerHTML = '<i class="fas fa-compress"></i>';
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) { // Safari
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) { // IE11
                    document.msExitFullscreen();
                }
                this.innerHTML = '<i class="fas fa-expand"></i>';
            }
        });

        // Escuchar cambios de pantalla completa para actualizar el ícono
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
            }
        });
    }

    // Botón de limpiar vista removido - no es necesario

    // Notificación
    document.getElementById('notification-close').addEventListener('click', hideNotification);

    // Event listener para el botón de vista 3D
    document.querySelectorAll('.view-button').forEach(button => {
        button.addEventListener('click', function () {
            document.querySelectorAll('.view-button').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const view = this.getAttribute('data-view');

            if (view === '3d') {
                // Cambiar a vista 3D
                document.getElementById('map-viewer').style.display = 'none';
                document.getElementById('viewer-3d').style.display = 'block';
                document.querySelector('.coordinates').style.display = 'none';
                document.querySelector('.coordinates-3d').style.display = 'block';
                document.querySelector('.legend').style.display = 'none';

                is3DViewActive = true;

                // Inicializar vista 3D si no está inicializada
                if (!scene3D) {
                    init3D();
                }

                // Procesar lotes en 3D si hay datos
                if (Object.keys(lotesData).length > 0) {
                    processLotesIn3D();
                }

                // Redimensionar el renderer
                setTimeout(() => {
                    const container = document.getElementById('viewer-3d');
                    camera3D.aspect = container.clientWidth / container.clientHeight;
                    camera3D.updateProjectionMatrix();
                    renderer3D.setSize(container.clientWidth, container.clientHeight);
                }, 100);
            } else {
                // Cambiar a vista 2D
                document.getElementById('map-viewer').style.display = 'block';
                document.getElementById('viewer-3d').style.display = 'none';
                document.querySelector('.coordinates').style.display = 'block';
                document.querySelector('.coordinates-3d').style.display = 'none';
                document.querySelector('.legend').style.display = 'block';

                is3DViewActive = false;

                // Cambiar capa de mapa
                if (map.hasLayer(currentLayer)) map.removeLayer(currentLayer);
                if (view === 'map') currentLayer = osmLayer;
                else if (view === 'satellite') currentLayer = satelliteLayer;
                else if (view === 'terrain') currentLayer = terrainLayer;
                map.addLayer(currentLayer);
            }
        });
    });
}

function setupScrollBehavior() {
    const sidebarContent = document.getElementById('sidebar-content');
    const scrollIndicator = document.getElementById('scroll-indicator');
    const sidebarShadow = document.getElementById('sidebar-shadow');

    // Verificar que los elementos existan antes de continuar
    if (!sidebarContent || !scrollIndicator || !sidebarShadow) {
        console.warn('Elementos de scroll no encontrados, omitiendo configuración de scroll');
        return;
    }

    function checkScroll() {
        const sidebarContent = document.getElementById('sidebar-content');
        const scrollIndicator = document.getElementById('scroll-indicator');
        const sidebarShadow = document.getElementById('sidebar-shadow');

        // Verificar que los elementos existan antes de usarlos
        if (!sidebarContent) return;

        const hasScroll = sidebarContent.scrollHeight > sidebarContent.clientHeight;
        const isScrolled = sidebarContent.scrollTop > 10;

        if (hasScroll && scrollIndicator) {
            scrollIndicator.classList.add('visible');
            if (isScrolled && sidebarShadow) {
                sidebarShadow.classList.add('visible');
            } else if (sidebarShadow) {
                sidebarShadow.classList.remove('visible');
            }
        } else {
            if (scrollIndicator) scrollIndicator.classList.remove('visible');
            if (sidebarShadow) sidebarShadow.classList.remove('visible');
        }
    }

    sidebarContent.addEventListener('scroll', function () {
        checkScroll();
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
            const maxScroll = this.scrollHeight - this.clientHeight;
            if (this.scrollTop > maxScroll - 50) {
                this.scrollTo({
                    top: maxScroll,
                    behavior: 'smooth'
                });
            }
        }, 150);
    });

    checkScroll();
    window.addEventListener('resize', checkScroll);

    let indicatorTimeout;
    sidebarContent.addEventListener('scroll', function () {
        clearTimeout(indicatorTimeout);
        indicatorTimeout = setTimeout(() => {
            scrollIndicator.classList.remove('visible');
        }, 3000);
    });
}

function showDxfModal() {
    document.getElementById('dxf-modal').classList.remove('hidden');
}

function hideDxfModal() {
    document.getElementById('dxf-modal').classList.add('hidden');
}

function showExcelModal() {
    if (Object.keys(lotesData).length === 0) {
        showNotification('Primero debes importar un archivo DXF con lotes', 'error');
        return;
    }
    document.getElementById('excel-modal').classList.remove('hidden');
}

function hideExcelModal() {
    document.getElementById('excel-modal').classList.add('hidden');
}

function handleExcelFileSelect(file) {
    const validExtensions = ['.xlsx', '.xls'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validExtensions.includes(fileExtension)) {
        showNotification('Por favor selecciona un archivo Excel (.xlsx o .xls)', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Tomar la primera hoja
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Convertir a array de arrays
            excelData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            document.querySelector('#excel-upload-area .upload-text').textContent = file.name;
            document.querySelector('#excel-upload-area .upload-hint').textContent = 'Archivo cargado exitosamente';
            document.getElementById('excel-process-button').disabled = false;

            showNotification('Archivo Excel cargado. Verifica la configuración de columnas.', 'info');

        } catch (err) {
            console.error('Error completo:', err);
            showNotification('Error al leer el archivo Excel: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

function processExcelFile() {
    if (!excelData) return;

    document.getElementById('loading').classList.add('active');
    document.getElementById('excel-modal').classList.add('hidden');

    setTimeout(() => {
        try {
            // Obtener configuración de columnas
            const loteCodeColumn = document.getElementById('lote-code-column').value.toUpperCase();
            const priceColumn = document.getElementById('price-column').value.toUpperCase();
            const statusColumn = document.getElementById('status-column').value.toUpperCase();
            const headerRow = parseInt(document.getElementById('header-row').value) - 1;

            // Convertir letras de columna a índices numéricos
            const colToIndex = (col) => {
                let index = 0;
                for (let i = 0; i < col.length; i++) {
                    index = index * 26 + (col.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
                }
                return index - 1;
            };

            const loteCodeIndex = colToIndex(loteCodeColumn);
            const priceIndex = colToIndex(priceColumn);
            const statusIndex = colToIndex(statusColumn);

            // Procesar datos del Excel
            const excelLotesData = {};

            for (let i = headerRow + 1; i < excelData.length; i++) {
                const row = excelData[i];
                if (!row || row.length <= Math.max(loteCodeIndex, priceIndex, statusIndex)) continue;

                const loteCode = row[loteCodeIndex];
                const price = parseFloat(row[priceIndex]) || 0;
                const status = row[statusIndex] ? row[statusIndex].toString().toLowerCase() : 'disponible';

                if (!loteCode) continue;

                // Normalizar el estado
                let normalizedStatus = 'available';
                if (status.includes('reserv')) {
                    normalizedStatus = 'reserved';
                } else if (status.includes('vend')) {
                    normalizedStatus = 'sold';
                }

                excelLotesData[loteCode.toString().trim()] = {
                    price: price,
                    status: normalizedStatus
                };
            }

            // Función para normalizar nombres de lotes para comparación
            const normalizeLoteName = (name) => {
                return name.toString()
                    .toUpperCase()
                    .replace(/\s+/g, ' ')
                    .trim();
            };

            // Aplicar datos del Excel a los lotes
            let updatedCount = 0;
            let notFoundCount = 0;
            const notFoundLotes = [];

            Object.keys(lotesData).forEach(loteName => {
                const normalizedLoteName = normalizeLoteName(loteName);

                // Buscar coincidencia en el Excel
                let found = false;
                for (const excelCode in excelLotesData) {
                    const normalizedExcelCode = normalizeLoteName(excelCode);

                    if (normalizedLoteName === normalizedExcelCode) {
                        lotesData[loteName].price = excelLotesData[excelCode].price;
                        lotesData[loteName].status = excelLotesData[excelCode].status;
                        updateLoteStyle(lotesData[loteName]);
                        updatedCount++;
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    notFoundCount++;
                    notFoundLotes.push(loteName);
                }
            });

            excelLoaded = true;
            updateStatistics();

            document.getElementById('loading').classList.remove('active');

            if (updatedCount > 0) {
                showNotification(`Se actualizaron ${updatedCount} lotes con datos del Excel`, 'success');

                if (notFoundCount > 0) {
                    console.warn(`${notFoundCount} lotes del DXF no se encontraron en el Excel:`, notFoundLotes);
                }
            } else {
                showNotification('No se encontraron coincidencias. Verifica que los códigos de lote en el Excel coincidan con los nombres de capa en el DXF.', 'error');
                console.log('Lotes en DXF:', Object.keys(lotesData));
                console.log('Códigos en Excel:', Object.keys(excelLotesData));
            }

            // Si hay un lote seleccionado, actualizar su vista
            if (selectedLote) {
                showLoteDetails(selectedLote);
            }

        } catch (error) {
            console.error('Error procesando Excel:', error);
            showNotification('Error al procesar el archivo Excel: ' + error.message, 'error');
            document.getElementById('loading').classList.remove('active');
        }
    }, 500);
}

function showReservationModal() {
    if (!selectedLote) return;

    document.getElementById('reservation-lote').value = selectedLote.name;
    document.getElementById('reservation-name').value = '';
    document.getElementById('reservation-phone').value = '';
    document.getElementById('reservation-email').value = '';
    document.getElementById('reservation-price').value = '';
    document.getElementById('reservation-amount').value = '';
    document.getElementById('reservation-notes').value = '';

    document.getElementById('reservation-modal').classList.remove('hidden');
}

function hideReservationModal() {
    document.getElementById('reservation-modal').classList.add('hidden');
}

function confirmReservation() {
    const name = document.getElementById('reservation-name').value.trim();
    const phone = document.getElementById('reservation-phone').value.trim();
    const email = document.getElementById('reservation-email').value.trim();
    const price = parseFloat(document.getElementById('reservation-price').value) || 0;
    const amount = parseFloat(document.getElementById('reservation-amount').value) || 0;
    const notes = document.getElementById('reservation-notes').value.trim();

    if (!name || !phone) {
        showNotification('Por favor complete los campos obligatorios', 'error');
        return;
    }

    const reservation = {
        id: Date.now(),
        lote: selectedLote.name,
        manzano: selectedLote.manzano,
        clientName: name,
        clientPhone: phone,
        clientEmail: email,
        price: price,
        reservationAmount: amount,
        notes: notes,
        status: 'reserved',
        date: new Date().toISOString()
    };

    reservations.push(reservation);
    saveReservations();

    // Actualizar estado del lote
    selectedLote.status = 'reserved';
    updateLoteStyle(selectedLote);

    updateReservationsList();
    updateStatistics();
    hideReservationModal();

    showNotification('Reserva realizada exitosamente', 'success');
}

function loadReservations() {
    const saved = localStorage.getItem('lotes_reservations');
    if (saved) {
        reservations = JSON.parse(saved);
        updateReservationsList();
        updateStatistics();
    }
}

function saveReservations() {
    localStorage.setItem('lotes_reservations', JSON.stringify(reservations));
}

function updateReservationsList() {
    const container = document.getElementById('reservations-list');
    const activeReservations = reservations.filter(r => r.status === 'reserved');

    if (activeReservations.length === 0) {
        container.innerHTML = '<div class="no-data-message">No hay reservas activas</div>';
        return;
    }

    container.innerHTML = '';
    activeReservations.forEach(reservation => {
        const item = document.createElement('div');
        item.className = 'reservation-item';
        item.innerHTML = `
                    <div class="reservation-header">
                        <span class="reservation-lote">${reservation.lote}</span>
                        <span class="reservation-status ${reservation.status}">${reservation.status === 'reserved' ? 'Reservado' : 'Vendido'}</span>
                    </div>
                    <div class="reservation-info">
                        <span><i class="fas fa-user"></i> ${reservation.clientName}</span>
                        <span><i class="fas fa-phone"></i> ${reservation.clientPhone}</span>
                        ${reservation.clientEmail ? `<span><i class="fas fa-envelope"></i> ${reservation.clientEmail}</span>` : ''}
                        ${reservation.price ? `<span><i class="fas fa-dollar-sign"></i> $${reservation.price.toFixed(2)}</span>` : ''}
                    </div>
                    <div class="reservation-actions">
                        <button class="reservation-action confirm" onclick="confirmSale(${reservation.id})">
                            <i class="fas fa-check"></i> Vender
                        </button>
                        <button class="reservation-action cancel" onclick="cancelReservation(${reservation.id})">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                    </div>
                `;
        container.appendChild(item);
    });
}

function confirmSale(reservationId) {
    const reservation = reservations.find(r => r.id === reservationId);
    if (reservation) {
        reservation.status = 'sold';
        const lote = lotesData[reservation.lote];
        if (lote) {
            lote.status = 'sold';
            updateLoteStyle(lote);
        }
        saveReservations();
        updateReservationsList();
        updateStatistics();
        showNotification('Venta confirmada exitosamente', 'success');
    }
}

function cancelReservation(reservationId) {
    const reservation = reservations.find(r => r.id === reservationId);
    if (reservation) {
        reservation.status = 'cancelled';
        const lote = lotesData[reservation.lote];
        if (lote) {
            lote.status = 'available';
            updateLoteStyle(lote);
        }
        saveReservations();
        updateReservationsList();
        updateStatistics();
        showNotification('Reserva cancelada', 'info');
    }
}

function updateLoteStyle(lote) {
    if (!lote || !lote.polygon) return;

    let color = '#8B4513';
    let fillOpacity = 0.3;

    switch (lote.status) {
        case 'available':
            color = '#2fa880';
            fillOpacity = 0.6;
            break;
        case 'reserved':
            color = '#f59e0b';
            fillOpacity = 0.5;
            break;
        case 'sold':
            color = '#ef4444';
            fillOpacity = 0.5;
            break;
    }

    lote.polygon.setStyle({
        color: color,
        fillOpacity: fillOpacity,
        weight: 2
    });

    // Actualizar la textura 3D si está activa
    if (is3DViewActive && dxfGroup3D && glbModel3D) {
        // Regenerar la textura completa
        scene3D.remove(dxfGroup3D);
        dxfGroup3D = new THREE.Group();
        createCombinedTextureOverlay();
    }
}

function handleFileSelect(file) {
    if (!file.name.toLowerCase().endsWith('.dxf')) {
        showNotification('Por favor selecciona un archivo DXF', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            if (typeof DxfParser === 'undefined') {
                showNotification('La librería DXF Parser no está cargada. Por favor recarga la página.', 'error');
                return;
            }

            const parser = new DxfParser();
            dxfData = parser.parseSync(e.target.result);

            document.querySelector('.upload-text').textContent = file.name;
            document.querySelector('.upload-hint').textContent = 'Archivo cargado exitosamente';
            document.getElementById('process-button').disabled = false;

        } catch (err) {
            console.error('Error completo:', err);
            showNotification('Error al leer el archivo DXF: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

function processDxfFile() {
    if (!dxfData) return;

    document.getElementById('loading').classList.add('active');
    document.getElementById('dxf-modal').classList.add('hidden');

    setTimeout(() => {
        try {
            processDXF(dxfData);
            document.getElementById('loading').classList.remove('active');
            showNotification('Archivo DXF procesado correctamente', 'success');
        } catch (error) {
            console.error('Error procesando DXF:', error);
            showNotification('Error al procesar el archivo DXF', 'error');
            document.getElementById('loading').classList.remove('active');
        }
    }, 500);
}

function processDXF(dxf) {
    dxfLayer.clearLayers();
    lotesLayer.clearLayers();
    manzanosLayer.clearLayers();

    manzanosData = {};
    lotesData = {};
    allBounds = null;

    const coordSystem = document.getElementById('coord-system').value;
    const utmZone = document.getElementById('utm-zone').value || '18';
    const hemisphere = document.getElementById('utm-hemisphere').value;
    let refLat = 0, refLng = 0, scale = 0.00001;

    if (coordSystem === 'utm') {
        if (!utmZone || isNaN(utmZone)) {
            showNotification('Por favor ingresa una zona UTM válida', 'error');
            return;
        }
    } else {
        refLat = parseFloat(document.getElementById('ref-lat').value) || 0;
        refLng = parseFloat(document.getElementById('ref-lng').value) || 0;
        scale = parseFloat(document.getElementById('scale-input').value) || 0.00001;
    }

    let bounds = null;
    if (!dxf.entities) return;

    dxf.entities.forEach(entity => {
        try {
            if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
                if (entity.vertices.length === 0) return;

                let points = [];
                const numSegments = entity.closed ? entity.vertices.length : entity.vertices.length - 1;

                for (let i = 0; i < numSegments; i++) {
                    const v1 = entity.vertices[i];
                    const v2 = entity.vertices[(i + 1) % entity.vertices.length];
                    const bulge = (entity.bulges && entity.bulges[i]) ? entity.bulges[i] : 0;

                    if (i === 0) points.push(convertDXFToLatLng(v1, coordSystem, utmZone, hemisphere, refLat, refLng, scale));

                    if (Math.abs(bulge) > 0.0001) {
                        const arcPoints = createBulgeArc(v1, v2, bulge, coordSystem, utmZone, hemisphere, refLat, refLng, scale, 96);
                        points = points.concat(arcPoints);
                    }

                    points.push(convertDXFToLatLng(v2, coordSystem, utmZone, hemisphere, refLat, refLng, scale));
                }

                if (points.length < 2) return;

                const color = getColorFromDXF(entity.color);
                const lineWeight = getLineWeightInPixels(entity.lineweight);

                const layerName = (entity.layer || '').toUpperCase();
                const isManzano = layerName.startsWith('MZ.') || layerName.startsWith('MZNO') || layerName.includes('MANZANO');
                const isLote = layerName.startsWith('LOTE ');
                const isAreaVerde = layerName.includes('AREA VERDE');
                const isAreaVial = layerName.includes('AREA VIAL');

                if (isManzano || isLote || isAreaVerde || isAreaVial) {
                    // Determinar color y opacidad según tipo de área
                    let polygonColor = '#8B4513';
                    let polygonFillOpacity = 0.3;
                    let polygonFillColor = null;

                    if (isManzano) {
                        polygonColor = '#4286f400';
                        polygonFillOpacity = 0;
                    } else if (isAreaVerde) {
                        polygonColor = '#2d7a2d';  // Verde oscuro para el borde
                        polygonFillColor = '#4CAF50';  // Verde para el relleno
                        polygonFillOpacity = 1;
                    } else if (isAreaVial) {
                        polygonColor = '#424242';  // Gris oscuro para el borde
                        polygonFillColor = '#78909C';  // Gris pavimento para el relleno
                        polygonFillOpacity = 1;
                    }

                    const polygonOptions = {
                        color: polygonColor,
                        weight: lineWeight,
                        fillOpacity: polygonFillOpacity,
                        smoothFactor: 0
                    };

                    // Agregar fillColor si está definido
                    if (polygonFillColor) {
                        polygonOptions.fillColor = polygonFillColor;
                    }

                    // Agregar clase CSS para áreas no interactivas
                    if (isAreaVerde || isAreaVial) {
                        polygonOptions.className = 'non-interactive-area';
                        polygonOptions.interactive = false;
                    }

                    const polygon = L.polygon(points, polygonOptions);

                    let name = '';
                    if (isManzano) {
                        name = layerName.replace('MZ.', '').replace('MZNO', '').replace('MANZANO', '').trim();

                        if (!manzanosData[name]) {
                            const expandedVerticesManzano = createExpandedVertices(entity.vertices, entity.bulges || []);

                            manzanosData[name] = {
                                name: name,
                                polygon: polygon,
                                lotes: [],
                                area: calculateAreaDXF(expandedVerticesManzano, [])
                            };
                        }

                        polygon.addTo(manzanosLayer);
                        polygon.options.interactive = false;
                        polygon.on('click', () => selectManzano(name));

                    } else if (isLote) {
                        const loteParts = layerName.replace('LOTE ', '').split(' ');
                        const manzanoLetra = loteParts[0];
                        const loteNumero = loteParts[1];

                        name = layerName;

                        const expandedVertices = createExpandedVertices(entity.vertices, entity.bulges || []);
                        const area = calculateAreaDXF(expandedVertices, []);

                        // Distancias reales de cada lado, calculadas desde las coordenadas
                        // planas originales del DXF (no desde lat/lng), para evitar el error
                        // de proyección/geodésico que introduce distanceTo() de Leaflet.
                        // Se eliminan primero vértices duplicados/de cierre que a veces
                        // trae el propio DXF, para que el conteo de lados sea correcto.
                        const dedupedVerts = dedupeClosedRing(entity.vertices, v => v.x, v => v.y, 0.001);
                        const sideDistances = dedupedVerts.map((v, idx) => {
                            const nextV = dedupedVerts[(idx + 1) % dedupedVerts.length];
                            const dx = nextV.x - v.x;
                            const dy = nextV.y - v.y;
                            return Math.sqrt(dx * dx + dy * dy);
                        });

                        const existingReservation = reservations.find(r => r.lote === name);
                        let status = 'available';
                        if (existingReservation) {
                            status = existingReservation.status;
                        }

                        lotesData[name] = {
                            name: name,
                            polygon: polygon,
                            area: area,
                            vertices: entity.vertices,
                            expandedVertices: expandedVertices,
                            layer: entity.layer,
                            manzano: manzanoLetra,
                            loteNumero: loteNumero,
                            points: points,
                            bulges: entity.bulges || [],
                            sideDistances: sideDistances,
                            status: status,
                            price: 0
                        };

                        updateLoteStyle(lotesData[name]);

                        polygon.addTo(lotesLayer);
                        polygon.options.loteName = name;
                        polygon.bringToFront();
                        polygon.on('click', () => selectLote(name));

                    } else if (isAreaVerde || isAreaVial) {
                        // Áreas especiales (verdes y viales) - completamente no interactivas
                        polygon.options.interactive = false;
                        polygon.options.bubblingMouseEvents = false;

                        // Deshabilitar todos los eventos de mouse
                        polygon.off();

                        polygon.addTo(dxfLayer);

                        // NO agregar tooltip para evitar cualquier interacción
                    }

                    // MODIFICADO: Solo calcular bounds para manzanos y lotes
                    points.forEach(point => {
                        if (!bounds) bounds = L.latLngBounds([point]);
                        else bounds.extend(point);
                    });
                } else {
                    const polyline = L.polyline(points, {
                        color: color,
                        weight: lineWeight,
                        opacity: 0.8
                    });

                    polyline.addTo(dxfLayer);

                    // MODIFICADO: No incluir otras polilíneas en el cálculo de bounds
                }
            } else if (entity.type === 'LINE') {
                if (!entity.vertices || entity.vertices.length < 2) return;

                const p1 = convertDXFToLatLng(entity.vertices[0], coordSystem, utmZone, hemisphere, refLat, refLng, scale);
                const p2 = convertDXFToLatLng(entity.vertices[1], coordSystem, utmZone, hemisphere, refLat, refLng, scale);

                const color = getColorFromDXF(entity.color);
                const lineWeight = getLineWeightInPixels(entity.lineweight);

                const line = L.polyline([p1, p2], {
                    color: color,
                    weight: lineWeight,
                    opacity: 0.8
                });

                line.addTo(dxfLayer);

                // MODIFICADO: No incluir líneas en el cálculo de bounds
            } else if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
                if (!entity.position) return;

                const text = entity.text || '';
                if (text.includes('\\A') || /^\d+:\d+\.\d+m$/.test(text.trim())) {
                    return;
                }

                const textOverlay = createTextOverlay(entity, coordSystem, utmZone, hemisphere, refLat, refLng, scale);

                if (textOverlay) {
                    console.log('🟢 AÑADIENDO TEXTO AL MAPA:', text); // ⬅️ AGREGAR ESTE LOG
                    textOverlay.addTo(dxfLayer);
                    console.log('✅ TEXTO AÑADIDO:', text); // ⬅️ AGREGAR ESTE LOG
                } else {
                    console.error('❌ textOverlay es NULL para:', text);
                }
            } else if (entity.type === 'CIRCLE') {
                if (entity.x === undefined || entity.y === undefined || entity.radius === undefined) return;

                const center = convertDXFToLatLng({ x: entity.x, y: entity.y }, coordSystem, utmZone, hemisphere, refLat, refLng, scale);
                const radiusInMeters = entity.radius * scale * 111000;

                const color = getColorFromDXF(entity.color);
                const lineWeight = getLineWeightInPixels(entity.lineweight);

                const circle = L.circle(center, {
                    radius: radiusInMeters,
                    color: color,
                    weight: lineWeight,
                    fillOpacity: 0.1
                });

                circle.addTo(dxfLayer);

                // MODIFICADO: No incluir círculos en el cálculo de bounds
            } else if (entity.type === 'ARC') {
                if (entity.x === undefined || entity.y === undefined || entity.radius === undefined) return;

                const center = convertDXFToLatLng({ x: entity.x, y: entity.y }, coordSystem, utmZone, hemisphere, refLat, refLng, scale);
                const radiusInMeters = entity.radius * scale * 111000;

                const color = getColorFromDXF(entity.color);
                const lineWeight = getLineWeightInPixels(entity.lineweight);

                const startAngle = entity.startAngle || 0;
                const endAngle = entity.endAngle || Math.PI;
                const points = [];

                for (let angle = startAngle; angle <= endAngle; angle += Math.PI / 36) {
                    const x = entity.x + entity.radius * Math.cos(angle);
                    const y = entity.y + entity.radius * Math.sin(angle);
                    points.push(convertDXFToLatLng({ x, y }, coordSystem, utmZone, hemisphere, refLat, refLng, scale));
                }

                const arc = L.polyline(points, {
                    color: color,
                    weight: lineWeight,
                    fillOpacity: 0
                });

                arc.addTo(dxfLayer);

                // MODIFICADO: No incluir arcos en el cálculo de bounds
            }
        } catch (err) {
            console.warn('Error procesando entidad:', err);
        }
    });

    assignLotesToManzanos();
    updateStatistics();

    allBounds = bounds;

    if (bounds && Object.keys(manzanosData).length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
    } else {
        showNotification('No se encontraron manzanos o lotes válidos en el DXF', 'error');
    }

    // Verificar que los elementos existan antes de acceder a ellos
    const sidebarContent = document.getElementById('sidebar-content');
    const scrollIndicator = document.getElementById('scroll-indicator');

    setTimeout(() => {
        // Es crucial volver a verificar que los elementos existan DENTRO del setTimeout
        const sidebarContent = document.getElementById('sidebar-content');
        const scrollIndicator = document.getElementById('scroll-indicator');

        // Solo proceder si ambos elementos fueron encontrados
        if (sidebarContent && scrollIndicator) {
            if (sidebarContent.scrollHeight > sidebarContent.clientHeight) {
                scrollIndicator.classList.add('visible');
            }
        } else {
            // Opcional: muestra una advertencia en la consola si no se encuentran los elementos
            if (!sidebarContent) console.warn('Elemento #sidebar-content no encontrado.');
            if (!scrollIndicator) console.warn('Elemento #scroll-indicator no encontrado.');
        }
    }, 100);

    // ELIMINADO: Bloque duplicado del scroll indicator

    // Guardar entidades de texto para usarlas en 3D
    if (!window.textEntities3D) {
        window.textEntities3D = [];
    }

    dxf.entities.forEach(entity => {
        if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
            if (!entity.position) return;

            const text = entity.text || '';
            if (text.includes('\\A') || /^\d+:\d+\.\d+m$/.test(text.trim())) {
                return;
            }

            window.textEntities3D.push(entity);
        }
    });

    // Si la vista 3D está activa, procesar los lotes en 3D
    if (is3DViewActive) {
        processLotesIn3D();
    }
}

function createTextOverlay(textEntity, coordSystem, utmZone, hemisphere, refLat, refLng, scale) {
    if (!textEntity.text || !textEntity.position) {
        console.warn('Entidad de texto sin texto o posición:', textEntity);
        return null;
    }

    const text = textEntity.text.replace(/\\P/g, '\n').replace(/%%[d,u]/g, '').replace(/\\[A-Za-z]+;/g, '');

    // Determinar el centro geométrico basado en los puntos de alineación
    let geometricCenterDxf;
    const halign = textEntity.halign || 0;
    const valign = textEntity.valign || 0;

    // Si tiene punto de alineación secundario (position2), usarlo para calcular el centro
    if (textEntity.position2 &&
        textEntity.position2.x !== undefined &&
        textEntity.position2.y !== undefined &&
        (textEntity.position2.x !== 0 || textEntity.position2.y !== 0)) {

        // Si halign y valign indican alineación centrada, usar position2 directamente
        if ((halign === 1 || halign === 4) && (valign === 1 || valign === 2)) {
            geometricCenterDxf = {
                x: textEntity.position2.x,
                y: textEntity.position2.y
            };
        } else {
            // Calcular el punto medio entre position y position2
            geometricCenterDxf = {
                x: (textEntity.position.x + textEntity.position2.x) / 2,
                y: (textEntity.position.y + textEntity.position2.y) / 2
            };
        }
    }
    // Si halign indica centro (1) o medio (4), y valign indica medio (2) o base (1)
    else if (halign === 1 && (valign === 2 || valign === 1)) {
        geometricCenterDxf = {
            x: textEntity.position.x,
            y: textEntity.position.y
        };
    }
    // Para textos sin alineación especial (como nombres de calles), usar position directamente
    else {
        geometricCenterDxf = {
            x: textEntity.position.x,
            y: textEntity.position.y
        };
    }

    // Convertir coordenadas DXF a LatLng
    const position = convertDXFToLatLng(
        geometricCenterDxf,
        coordSystem,
        utmZone,
        hemisphere,
        refLat,
        refLng,
        scale
    );

    // Verificar que la posición sea válida
    if (!position || isNaN(position[0]) || isNaN(position[1])) {
        console.error('Error: Posición inválida para texto:', text, position);
        return null;
    }

    // Verificar que las coordenadas estén en rangos razonables
    if (Math.abs(position[0]) > 90 || Math.abs(position[1]) > 180) {
        console.error('Error: Coordenadas fuera de rango para texto:', text, position);
        return null;
    }

    const canvasFontSize = 64;
    const color = getColorFromDXF(textEntity.color);
    const dxfTextHeight = textEntity.height || 2.0;
    const dxfUnitsToMeters = 1.5;
    const realWorldHeight = dxfTextHeight * dxfUnitsToMeters;
    const rotationInRadians = -(textEntity.rotation || 0) * Math.PI / 180;

    // Crear canvas temporal para medir texto
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = `bold ${canvasFontSize}px Arial`;
    tempCtx.textAlign = 'center';
    tempCtx.textBaseline = 'middle';

    const lines = text.split('\n');
    let maxWidth = 0;
    lines.forEach(line => {
        const metrics = tempCtx.measureText(line);
        maxWidth = Math.max(maxWidth, metrics.width);
    });
    const lineHeight = canvasFontSize * 1.2;
    const textHeight = lines.length * lineHeight;

    // Calcular dimensiones reales
    const realWorldWidth = (maxWidth / textHeight) * realWorldHeight;
    const halfWidth = realWorldWidth / 2;
    const halfHeight = realWorldHeight / 2;

    // Calcular esquinas locales
    const localCorners = [
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight }
    ];

    // Aplicar rotación
    const cos = Math.cos(rotationInRadians);
    const sin = Math.sin(rotationInRadians);
    const rotatedLocalCorners = localCorners.map(corner => ({
        x: corner.x * cos - corner.y * sin,
        y: corner.x * sin + corner.y * cos
    }));

    // Convertir a coordenadas geográficas
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = metersPerDegreeLat * Math.cos(position[0] * Math.PI / 180);

    const geoCorners = rotatedLocalCorners.map(corner => {
        const latOffset = corner.y / metersPerDegreeLat;
        const lngOffset = corner.x / metersPerDegreeLng;
        return [position[0] + latOffset, position[1] + lngOffset];
    });

    const bounds = L.latLngBounds(geoCorners);

    // Crear canvas para el texto
    const unrotatedWidth = maxWidth;
    const unrotatedHeight = textHeight;
    const cornersForCanvas = [
        { x: -unrotatedWidth / 2, y: -unrotatedHeight / 2 },
        { x: unrotatedWidth / 2, y: -unrotatedHeight / 2 },
        { x: unrotatedWidth / 2, y: unrotatedHeight / 2 },
        { x: -unrotatedWidth / 2, y: unrotatedHeight / 2 }
    ];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cornersForCanvas.forEach(corner => {
        const rotatedX = corner.x * cos - corner.y * sin;
        const rotatedY = corner.x * sin + corner.y * cos;
        minX = Math.min(minX, rotatedX);
        minY = Math.min(minY, rotatedY);
        maxX = Math.max(maxX, rotatedX);
        maxY = Math.max(maxY, rotatedY);
    });

    const finalCanvasWidth = Math.ceil(maxX - minX);
    const finalCanvasHeight = Math.ceil(maxY - minY);

    // Verificar dimensiones válidas
    if (finalCanvasWidth <= 0 || finalCanvasHeight <= 0) {
        console.error('Error: Dimensiones de canvas inválidas para texto:', text);
        return null;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = finalCanvasWidth;
    canvas.height = finalCanvasHeight;

    ctx.font = `bold ${canvasFontSize}px Arial`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.translate(finalCanvasWidth / 2, finalCanvasHeight / 2);
    ctx.rotate(rotationInRadians);

    // Dibujar sombra y texto
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'black';

    // Dibujar cada línea de texto
    const totalTextHeight = lines.length * lineHeight;
    const startY = -(totalTextHeight / 2) + (lineHeight / 2);

    lines.forEach((line, index) => {
        const y = startY + (index * lineHeight);
        ctx.strokeText(line, 0, y);
        ctx.fillText(line, 0, y);
    });

    ctx.restore();

    const imageUrl = canvas.toDataURL('image/png');


    return L.imageOverlay(imageUrl, bounds, {
        interactive: false,
        zIndex: 250
    });
}

function processLotesIn3D() {
    if (!is3DViewActive || !glbModel3D) {
        console.warn('Vista 3D no activa o modelo GLB no cargado');
        return;
    }

    // Calcular hash del modelo actual
    const currentModelHash = calculateModelHash();

    // Verificar si ya tenemos caché válido
    if (projectionCache3D && lastModelHash === currentModelHash) {
        console.log('✓ Usando caché de proyecciones (sin recalcular)');

        // Limpiar lotes existentes
        if (dxfGroup3D) {
            scene3D.remove(dxfGroup3D);
            dxfGroup3D = null;
        }

        dxfGroup3D = new THREE.Group();
        dxfGroup3D.name = 'DXF_Overlays';

        // Reconstruir visualización desde caché
        reconstructFromCache();

        showNotification(`${Object.keys(lotesData).length} lotes cargados desde caché`, 'success');
        return;
    }

    // Si no hay caché válido, calcular desde cero
    console.log('Calculando proyecciones (primera vez o modelo cambió)...');

    // Limpiar lotes existentes
    if (dxfGroup3D) {
        scene3D.remove(dxfGroup3D);
        dxfGroup3D = null;
    }

    dxfGroup3D = new THREE.Group();
    dxfGroup3D.name = 'DXF_Overlays';

    // Crear la textura combinada proyectada sobre la superficie
    createSurfaceProjectedOverlay();

    // Guardar hash del modelo
    lastModelHash = currentModelHash;

    console.log('Lotes procesados en 3D:', Object.keys(lotesData).length);
    showNotification('Lotes proyectados sobre superficie 3D', 'success');
}


// **AGREGAR ESTA FUNCIÓN NUEVA:**
function calculateModelHash() {
    // Crear un hash simple basado en propiedades del modelo
    if (!glbModel3D) return null;

    const bbox = new THREE.Box3().setFromObject(glbModel3D);
    const hash = `${bbox.min.x.toFixed(2)}_${bbox.min.y.toFixed(2)}_${bbox.min.z.toFixed(2)}_` +
        `${bbox.max.x.toFixed(2)}_${bbox.max.y.toFixed(2)}_${bbox.max.z.toFixed(2)}_` +
        `${Object.keys(lotesData).length}`;

    return hash;
}


// **AGREGAR ESTA FUNCIÓN NUEVA:**
function reconstructFromCache() {
    if (!projectionCache3D) return;

    const startTime = performance.now();

    Object.values(lotesData).forEach(lote => {
        const cacheKey = lote.name;
        const cachedData = projectionCache3D[cacheKey];

        if (!cachedData) return;

        // Determinar color según estado actual
        let color;
        if (lote.status === 'available') {
            color = new THREE.Color(0x10b981);
        } else if (lote.status === 'reserved') {
            color = new THREE.Color(0xf59e0b);
        } else if (lote.status === 'sold') {
            color = new THREE.Color(0xef4444);
        } else {
            color = new THREE.Color(0x8B4513);
        }

        // Reconstruir bordes desde caché
        for (let i = 0; i < cachedData.projectedVertices.length; i++) {
            const v1Data = cachedData.projectedVertices[i];
            const v2Data = cachedData.projectedVertices[(i + 1) % cachedData.projectedVertices.length];

            const v1 = new THREE.Vector3(v1Data.x, v1Data.y, v1Data.z);
            const v2 = new THREE.Vector3(v2Data.x, v2Data.y, v2Data.z);

            const curve = new THREE.LineCurve3(v1, v2);
            const tubeGeometry = new THREE.TubeGeometry(curve, 1, 0.15, 8, false);
            const tubeMaterial = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.7,
                metalness: 0.3
            });

            const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
            tube.renderOrder = 1000;
            tube.userData = {
                loteName: lote.name,
                type: 'border'
            };

            dxfGroup3D.add(tube);
        }

        // Reconstruir etiqueta desde caché
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 256;
        labelCanvas.height = 256;
        const ctx = labelCanvas.getContext('2d');

        ctx.fillStyle = '#4285F4';
        ctx.beginPath();
        ctx.arc(128, 128, 100, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 8;
        ctx.stroke();

        const loteNum = lote.loteNumero || lote.name.replace(/\D+/g, '');
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 100px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(loteNum, 128, 128);

        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        const labelMaterial = new THREE.SpriteMaterial({
            map: labelTexture,
            depthTest: false,
            depthWrite: false
        });

        const sprite = new THREE.Sprite(labelMaterial);
        sprite.position.set(
            cachedData.centroid.x,
            cachedData.centroid.y + 3,
            cachedData.centroid.z
        );
        sprite.scale.set(5, 5, 1);
        sprite.renderOrder = 1001;
        sprite.userData = {
            loteName: lote.name,
            type: 'label'
        };

        dxfGroup3D.add(sprite);
    });

    scene3D.add(dxfGroup3D);

    const endTime = performance.now();
    const timeElapsed = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`✓ Reconstrucción desde caché: ${timeElapsed}s`);
}

async function createSurfaceProjectedOverlay() {
    if (!glbModel3D || Object.keys(lotesData).length === 0) {
        console.error('No hay modelo GLB o lotes cargados');
        return;
    }

    // Mostrar overlay de progreso
    const progressOverlay = document.getElementById('progress-overlay');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressLotes = document.getElementById('progress-lotes');
    const progressTotal = document.getElementById('progress-total');

    progressOverlay.classList.add('active');
    progressBar.style.width = '0%';
    progressText.textContent = 'Inicializando... 0%';

    const lotesArray = Object.values(lotesData);
    progressTotal.textContent = lotesArray.length;
    progressLotes.textContent = '0';

    console.log('=== PROYECCIÓN OPTIMIZADA - INICIO ===');
    const startTime = performance.now();

    const bbox = new THREE.Box3().setFromObject(glbModel3D);
    const glbMax = bbox.max;
    const projectionHeight = glbMax.y + 100;

    const raycaster = new THREE.Raycaster();
    const rayDirection = new THREE.Vector3(0, -1, 0);

    const intersectionCache = new Map();
    const CACHE_GRID_SIZE = 5;

    function getCacheKey(x, z) {
        const gridX = Math.floor(x / CACHE_GRID_SIZE);
        const gridZ = Math.floor(z / CACHE_GRID_SIZE);
        return `${gridX}_${gridZ}`;
    }

    function projectPointWithCache(x, z) {
        const cacheKey = getCacheKey(x, z);

        if (intersectionCache.has(cacheKey)) {
            const cachedY = intersectionCache.get(cacheKey);
            return new THREE.Vector3(x, cachedY + 0.3, z);
        }

        const rayOrigin = new THREE.Vector3(x, projectionHeight, z);
        raycaster.set(rayOrigin, rayDirection);

        raycaster.firstHitOnly = true;
        const intersects = raycaster.intersectObject(glbModel3D, true);

        let resultY;
        if (intersects.length > 0) {
            resultY = intersects[0].point.y;
            intersectionCache.set(cacheKey, resultY);
        } else {
            resultY = glbMax.y + 1;
            intersectionCache.set(cacheKey, resultY);
        }

        return new THREE.Vector3(x, resultY + 0.3, z);
    }

    // Actualizar progreso: Pre-calentamiento de caché
    progressText.textContent = 'Pre-calculando puntos... 5%';
    progressBar.style.width = '5%';
    await new Promise(resolve => setTimeout(resolve, 10)); // Permitir que el UI se actualice

    console.log('Pre-calentando caché de intersecciones...');

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

    Object.values(lotesData).forEach(lote => {
        if (!lote.vertices) return;
        const expandedVertices = lote.expandedVertices || lote.vertices;

        expandedVertices.forEach(v => {
            let x3D = hasOrigin3D ? (v.x - originUTM3D.x) : v.x;
            let z3D = hasOrigin3D ? -(v.y - originUTM3D.z) : -v.y;
            minX = Math.min(minX, x3D);
            maxX = Math.max(maxX, x3D);
            minZ = Math.min(minZ, z3D);
            maxZ = Math.max(maxZ, z3D);
        });
    });

    const preCacheSteps = 3;
    const stepX = (maxX - minX) / preCacheSteps;
    const stepZ = (maxZ - minZ) / preCacheSteps;

    for (let i = 0; i <= preCacheSteps; i++) {
        for (let j = 0; j <= preCacheSteps; j++) {
            const x = minX + i * stepX;
            const z = minZ + j * stepZ;
            projectPointWithCache(x, z);
        }
    }

    console.log(`Caché pre-calentada con ${intersectionCache.size} puntos`);

    // Actualizar progreso: Iniciando procesamiento
    progressText.textContent = 'Procesando lotes... 10%';
    progressBar.style.width = '10%';
    await new Promise(resolve => setTimeout(resolve, 10));

    let lotesProcessed = 0;
    let totalVertices = 0;
    let cachedHits = 0;

    // Procesar lotes en lotes (chunks) para no bloquear el UI
    const CHUNK_SIZE = 5; // Procesar 5 lotes a la vez

    for (let chunkStart = 0; chunkStart < lotesArray.length; chunkStart += CHUNK_SIZE) {
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, lotesArray.length);
        const chunk = lotesArray.slice(chunkStart, chunkEnd);

        // Procesar chunk
        for (const lote of chunk) {
            if (!lote.vertices || lote.vertices.length < 3) continue;

            const expandedVertices = lote.expandedVertices || lote.vertices;
            const vertices3D = [];
            const projectedVertices = [];

            expandedVertices.forEach(v => {
                let x3D = hasOrigin3D ? (v.x - originUTM3D.x) : v.x;
                let z3D = hasOrigin3D ? -(v.y - originUTM3D.z) : -v.y;
                vertices3D.push({ x: x3D, z: z3D });
            });

            vertices3D.forEach(vertex => {
                const projected = projectPointWithCache(vertex.x, vertex.z);
                projectedVertices.push(projected);
                totalVertices++;

                const cacheKey = getCacheKey(vertex.x, vertex.z);
                if (intersectionCache.has(cacheKey)) {
                    cachedHits++;
                }
            });

            if (projectedVertices.length < 3) continue;

            let color;
            if (lote.status === 'available') {
                color = new THREE.Color(0x10b981);
            } else if (lote.status === 'reserved') {
                color = new THREE.Color(0xf59e0b);
            } else if (lote.status === 'sold') {
                color = new THREE.Color(0xef4444);
            } else {
                color = new THREE.Color(0x8B4513);
            }

            for (let i = 0; i < projectedVertices.length; i++) {
                const v1 = projectedVertices[i];
                const v2 = projectedVertices[(i + 1) % projectedVertices.length];

                const curve = new THREE.LineCurve3(v1, v2);
                const tubeGeometry = new THREE.TubeGeometry(curve, 1, 0.15, 8, false);
                const tubeMaterial = new THREE.MeshStandardMaterial({
                    color: color,
                    roughness: 0.7,
                    metalness: 0.3
                });

                const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
                tube.renderOrder = 1000;
                tube.userData = {
                    loteName: lote.name,
                    type: 'border'
                };

                dxfGroup3D.add(tube);
            }

            let signedArea = 0;
            let centroidX = 0;
            let centroidZ = 0;

            for (let i = 0; i < projectedVertices.length; i++) {
                const v1 = projectedVertices[i];
                const v2 = projectedVertices[(i + 1) % projectedVertices.length];

                const a = v1.x * v2.z - v2.x * v1.z;
                signedArea += a;
                centroidX += (v1.x + v2.x) * a;
                centroidZ += (v1.z + v2.z) * a;
            }

            signedArea *= 0.5;
            centroidX /= (6 * signedArea);
            centroidZ /= (6 * signedArea);

            const rayCentroid = new THREE.Vector3(centroidX, projectionHeight, centroidZ);
            raycaster.set(rayCentroid, rayDirection);
            const intersectsCentroid = raycaster.intersectObject(glbModel3D, true);

            let centroidY;
            if (intersectsCentroid.length > 0) {
                centroidY = intersectsCentroid[0].point.y + 0.3;
            } else {
                centroidY = projectedVertices.reduce((sum, v) => sum + v.y, 0) / projectedVertices.length;
            }

            const labelCanvas = document.createElement('canvas');
            labelCanvas.width = 256;
            labelCanvas.height = 256;
            const ctx = labelCanvas.getContext('2d');

            ctx.fillStyle = '#4285F4';
            ctx.beginPath();
            ctx.arc(128, 128, 100, 0, 2 * Math.PI);
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 8;
            ctx.stroke();

            const loteNum = lote.loteNumero || lote.name.replace(/\D+/g, '');
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 100px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(loteNum, 128, 128);

            const labelTexture = new THREE.CanvasTexture(labelCanvas);
            const labelMaterial = new THREE.SpriteMaterial({
                map: labelTexture,
                depthTest: false,
                depthWrite: false
            });

            const sprite = new THREE.Sprite(labelMaterial);
            sprite.position.set(centroidX, centroidY + 3, centroidZ);
            sprite.scale.set(5, 5, 1);
            sprite.renderOrder = 1001;
            sprite.userData = {
                loteName: lote.name,
                type: 'label'
            };

            dxfGroup3D.add(sprite);
            lotesProcessed++;
        }

        // Actualizar progreso después de cada chunk
        const progress = 10 + (chunkEnd / lotesArray.length) * 80; // 10% a 90%
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `Procesando lotes... ${Math.round(progress)}%`;
        progressLotes.textContent = chunkEnd;

        // Permitir que el navegador actualice el UI
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Guardar en caché
    progressText.textContent = 'Guardando caché... 95%';
    progressBar.style.width = '95%';
    await new Promise(resolve => setTimeout(resolve, 10));

    projectionCache3D = {};

    Object.values(lotesData).forEach(lote => {
        if (!lote.vertices || lote.vertices.length < 3) return;

        const expandedVertices = lote.expandedVertices || lote.vertices;
        const vertices3D = [];
        const projectedVerticesData = [];

        expandedVertices.forEach(v => {
            let x3D = hasOrigin3D ? (v.x - originUTM3D.x) : v.x;
            let z3D = hasOrigin3D ? -(v.y - originUTM3D.z) : -v.y;
            vertices3D.push({ x: x3D, z: z3D });
        });

        vertices3D.forEach(vertex => {
            const projected = projectPointWithCache(vertex.x, vertex.z);
            projectedVerticesData.push({
                x: projected.x,
                y: projected.y,
                z: projected.z
            });
        });

        if (projectedVerticesData.length < 3) return;

        let signedArea = 0;
        let centroidX = 0;
        let centroidZ = 0;

        for (let i = 0; i < projectedVerticesData.length; i++) {
            const v1 = projectedVerticesData[i];
            const v2 = projectedVerticesData[(i + 1) % projectedVerticesData.length];

            const a = v1.x * v2.z - v2.x * v1.z;
            signedArea += a;
            centroidX += (v1.x + v2.x) * a;
            centroidZ += (v1.z + v2.z) * a;
        }

        signedArea *= 0.5;
        centroidX /= (6 * signedArea);
        centroidZ /= (6 * signedArea);

        const rayCentroid = new THREE.Vector3(centroidX, projectionHeight, centroidZ);
        raycaster.set(rayCentroid, rayDirection);
        const intersectsCentroid = raycaster.intersectObject(glbModel3D, true);

        let centroidY;
        if (intersectsCentroid.length > 0) {
            centroidY = intersectsCentroid[0].point.y + 0.3;
        } else {
            centroidY = projectedVerticesData.reduce((sum, v) => sum + v.y, 0) / projectedVerticesData.length;
        }

        projectionCache3D[lote.name] = {
            projectedVertices: projectedVerticesData,
            centroid: { x: centroidX, y: centroidY, z: centroidZ }
        };
    });

    console.log(`✓ Caché guardado con ${Object.keys(projectionCache3D).length} lotes`);

    scene3D.add(dxfGroup3D);

    const endTime = performance.now();
    const timeElapsed = ((endTime - startTime) / 1000).toFixed(2);
    const cacheEfficiency = ((cachedHits / totalVertices) * 100).toFixed(1);

    console.log('=== PROYECCIÓN OPTIMIZADA - RESULTADOS ===');
    console.log(`✓ ${lotesProcessed} lotes procesados`);
    console.log(`✓ ${totalVertices} vértices proyectados`);
    console.log(`✓ ${cachedHits} hits de caché (${cacheEfficiency}% eficiencia)`);
    console.log(`✓ Tiempo: ${timeElapsed}s`);
    console.log(`✓ Tamaño de caché: ${intersectionCache.size} entradas`);

    // Completar progreso
    progressBar.style.width = '100%';
    progressText.textContent = '¡Completado! 100%';

    // Esperar un momento antes de ocultar
    await new Promise(resolve => setTimeout(resolve, 500));

    progressOverlay.classList.remove('active');

    showNotification(`${lotesProcessed} lotes en 3D (${timeElapsed}s) - ${cacheEfficiency}% caché`, 'success');
}




// Función auxiliar para calcular puntos de arco
function calculateArcPoints(v1, v2, bulge, segments) {
    const points = [];
    const includedAngle = 4 * Math.atan(bulge);
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const chordLength = Math.sqrt(dx * dx + dy * dy);

    if (chordLength < 0.0001) return points;

    const radius = chordLength / (2 * Math.sin(includedAngle / 2));
    const chordAngle = Math.atan2(dy, dx);
    const centerAngle = (Math.PI / 2 - includedAngle / 2) + chordAngle;
    const centerX = v1.x + radius * Math.cos(centerAngle);
    const centerY = v1.y + radius * Math.sin(centerAngle);

    let startAngle = Math.atan2(v1.y - centerY, v1.x - centerX);
    let endAngle = Math.atan2(v2.y - centerY, v2.x - centerX);

    if (bulge > 0) {
        if (endAngle <= startAngle) endAngle += 2 * Math.PI;
    } else {
        if (startAngle <= endAngle) startAngle += 2 * Math.PI;
        [startAngle, endAngle] = [endAngle, startAngle];
    }

    const angleStep = (endAngle - startAngle) / segments;

    for (let i = 1; i < segments; i++) {
        const angle = startAngle + angleStep * i;
        const x = centerX + Math.abs(radius) * Math.cos(angle);
        const y = centerY + Math.abs(radius) * Math.sin(angle);
        points.push({ x, y });
    }

    return points;
}

function assignLotesToManzanos() {
    Object.keys(lotesData).forEach(loteName => {
        const lote = lotesData[loteName];
        const manzanoLetra = lote.manzano;

        if (manzanosData[manzanoLetra]) {
            manzanosData[manzanoLetra].lotes.push(loteName);
        } else {
            console.warn(`No se encontró el manzano "${manzanoLetra}" para el lote "${loteName}"`);
        }
    });
}

function isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lat, yi = polygon[i].lng;
        const xj = polygon[j].lat, yj = polygon[j].lng;

        const intersect = ((yi > point.lng) != (yj > point.lng))
            && (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function updateManzanosList() {
    // Ya no necesitamos actualizar la lista de manzanos
}

function updateLotesList() {
    // Ya no necesitamos actualizar la lista de lotes
}

function updateStatistics() {
    document.getElementById('total-manzanos').textContent = Object.keys(manzanosData).length;
    document.getElementById('total-lotes').textContent = Object.keys(lotesData).length;

    let availableCount = 0;
    let reservedCount = 0;
    let soldCount = 0;
    let totalArea = 0;

    Object.values(lotesData).forEach(lote => {
        totalArea += lote.area;
        switch (lote.status) {
            case 'available':
                availableCount++;
                break;
            case 'reserved':
                reservedCount++;
                break;
            case 'sold':
                soldCount++;
                break;
        }
    });

    document.getElementById('available-lotes').textContent = availableCount;
    document.getElementById('reserved-lotes').textContent = reservedCount;
    document.getElementById('sold-lotes').textContent = soldCount;
    document.getElementById('total-area').textContent = `${totalArea.toFixed(2)} m²`;
}

function filterLotesByManzano(manzanoName) {
    // Ya no necesitamos filtrar lotes por manzano
}

function selectManzano(manzanoName) {
    const manzano = manzanosData[manzanoName];
    if (!manzano) return;

    manzanosLayer.eachLayer(layer => {
        layer.setStyle({ fillOpacity: 0 });
    });

    manzano.polygon.setStyle({ fillOpacity: 0.1 });

    lotesLayer.bringToFront();

    map.fitBounds(manzano.polygon.getBounds(), { padding: [50, 50] });

    showNotification(`Manzano seleccionado: ${manzanoName}`, 'info');
}

function selectLote(loteName) {
    const lote = lotesData[loteName];
    if (!lote) return;

    lotesLayer.eachLayer(layer => {
        layer.setStyle({ fillOpacity: 0.3, weight: 2 });
    });

    lote.polygon.setStyle({ fillOpacity: 0.5, weight: 3 });

    lote.polygon.bringToFront();
    lotesLayer.bringToFront();

    // Ajustar zoom con más padding para ver el lote más alejado
    map.fitBounds(lote.polygon.getBounds(), {
        padding: [200, 200],  // Aumentado de [50, 50] a [150, 150]
        maxZoom: 50           // Limita el zoom máximo
    });

    selectedLote = lote;

    // Resaltar lote en 3D si está activo
    if (is3DViewActive && dxfGroup3D) {
        // Primero, restaurar todos los lotes a su estado normal
        dxfGroup3D.traverse((child) => {
            if (child.userData && child.userData.type === 'fill') {
                if (child.material) {
                    child.material.opacity = 0.3;
                }
            }
        });

        // Luego, resaltar el lote seleccionado
        dxfGroup3D.traverse((child) => {
            if (child.userData && child.userData.loteName === loteName) {
                if (child.userData.type === 'fill' && child.material) {
                    child.material.opacity = 0.6;
                }
            }
        });
    }

    showLoteDetails(lote);

    // Resaltar lote en 3D si está activo
    if (is3DViewActive && dxfGroup3D) {
        highlightLoteIn3D(loteName);
    }
}

function showLoteDetails(lote) {
    const lotDataContent = document.getElementById('lot-data-content');
    let latlngsForPerimeter = lote.polygon.getLatLngs()[0];
    latlngsForPerimeter = dedupeClosedRing(latlngsForPerimeter, p => p.lng, p => p.lat, 1e-9);
    const perimeter = (lote.sideDistances && lote.sideDistances.length === latlngsForPerimeter.length)
        ? lote.sideDistances.reduce((sum, d) => sum + d, 0)
        : calculatePerimeter(latlngsForPerimeter);

    let statusText = 'Disponible';
    let statusColor = 'var(--available-color)';
    let actionButton = '';

    switch (lote.status) {
        case 'reserved':
            statusText = 'Reservado';
            statusColor = 'var(--reserved-color)';
            break;
        case 'sold':
            statusText = 'Vendido';
            statusColor = 'var(--sold-color)';
            break;
        default:
            statusText = 'Disponible';
            statusColor = 'var(--available-color)';
    }

    // Botón de WhatsApp siempre visible
    const whatsappNumber = '573044130405'; // Código de país + número
    const message = `Hola, estoy interesado en el Lote Nro *${lote.loteNumero}*\n\n` +
        ` Manzana: ${lote.manzano}\n` +
        ` Área: ${lote.area.toFixed(2)} m²\n` +
        ` Precio: $${lote.price > 0 ? lote.price.toFixed(2) : 'Consultar'}\n` +
        ` Estado: ${statusText}\n\n` +
        `¿Podría darme más información?`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;

    actionButton = `<button class="control-button success" onclick="window.open('${whatsappUrl}', '_blank')">
    <i class="fab fa-whatsapp"></i>
    <span>Consultar por WhatsApp</span>
</button>`;

    const priceDisplay = lote.price > 0 ? `$${lote.price.toFixed(2)}` : 'No definido';
    const showPriceTag = lote.price > 0 && lote.status === 'available';

    lotDataContent.innerHTML = `
                <div class="lot-data-grid">
                    <div class="lot-data-item">
                        <span class="lot-data-label">Área:</span>
                        <span class="lot-data-value">${lote.area.toFixed(2)} m²</span>
                    </div>
                    <div class="lot-data-item">
                        <span class="lot-data-label">Perímetro:</span>
                        <span class="lot-data-value">${perimeter.toFixed(2)} mts</span>
                    </div>
                    <div class="lot-data-item">
                        <span class="lot-data-label">Nro. Lote:</span>
                        <span class="lot-data-value">${lote.loteNumero}</span>
                    </div>
                    <div class="lot-data-item">
                        <span class="lot-data-label">Manzana:</span>
                        <span class="lot-data-value">${lote.manzano.replace('MZNO ', '')}</span>
                    </div>
                    <div class="lot-data-item">
                        <span class="lot-data-label">Estado:</span>
                        <span class="lot-data-value" style="color: ${statusColor};">${statusText}</span>
                    </div>
                    <div class="lot-data-item">
                        <span class="lot-data-label">Precio:</span>
                        <span class="lot-data-value">${priceDisplay}</span>
                    </div>
                </div>
                ${actionButton}
                ${showPriceTag ? `<div class="price-tag">$${lote.price.toFixed(2)} USD</div>` : ''}
            `;

    drawLoteInCanvas(lote);
}

function drawLoteInCanvas(lote) {
    const canvas = document.getElementById('lot-plan-canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let latlngs = lote.polygon.getLatLngs()[0];

    // Igual que con los vértices del DXF: se eliminan puntos duplicados o el
    // punto de cierre repetido que agrega Leaflet, para que el número de
    // lados coincida exactamente con sideDistances.
    latlngs = dedupeClosedRing(latlngs, p => p.lng, p => p.lat, 1e-9);

    let minLat = latlngs[0].lat, maxLat = latlngs[0].lat;
    let minLng = latlngs[0].lng, maxLng = latlngs[0].lng;

    latlngs.forEach(point => {
        minLat = Math.min(minLat, point.lat);
        maxLat = Math.max(maxLat, point.lat);
        minLng = Math.min(minLng, point.lng);
        maxLng = Math.max(maxLng, point.lng);
    });

    const margin = 15;
    const width = canvas.width - 2 * margin;
    const height = canvas.height - 2 * margin;

    const latRange = maxLat - minLat;
    const lngRange = maxLng - minLng;

    let scale, offsetX = 0, offsetY = 0;
    const canvasAspect = width / height;
    const geoAspect = lngRange / latRange;

    if (geoAspect > canvasAspect) {
        scale = width / lngRange;
        offsetY = (height - (latRange * scale)) / 2;
    } else {
        scale = height / latRange;
        offsetX = (width - (lngRange * scale)) / 2;
    }

    const points = latlngs.map(point => {
        const x = margin + offsetX + ((point.lng - minLng) * scale);
        const y = margin + offsetY + ((maxLat - point.lat) * scale);
        return { x, y };
    });

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.closePath();

    let fillColor = 'rgba(139, 69, 19, 0.2)';
    switch (lote.status) {
        case 'available':
            fillColor = 'rgba(16, 185, 129, 0.2)';
            break;
        case 'reserved':
            fillColor = 'rgba(245, 158, 11, 0.2)';
            break;
        case 'sold':
            fillColor = 'rgba(239, 68, 68, 0.2)';
            break;
    }

    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Solo se pueden usar las distancias reales (planas, del DXF) cuando el número
    // de puntos del polígono coincide con el número de lados originales, es decir,
    // cuando el lote no tiene arcos/curvas que expandan los vértices.
    const canUseRealDistances = lote.sideDistances && lote.sideDistances.length === latlngs.length;

    const individualSegments = [];
    for (let i = 0; i < latlngs.length; i++) {
        const nextIndex = (i + 1) % latlngs.length;
        const distance = canUseRealDistances
            ? lote.sideDistances[i]
            : latlngs[i].distanceTo(latlngs[nextIndex]);
        const isCurve = lote.bulges && lote.bulges[i] && Math.abs(lote.bulges[i]) > 0.0001;

        individualSegments.push({
            index: i,
            distance: distance,
            isCurve: isCurve
        });
    }

    const SIZE_TOLERANCE = 0.15;
    const MIN_SEGMENTS_TO_GROUP = 3;
    const LARGE_THRESHOLD = 5;

    const groupedSegments = [];
    let i = 0;

    while (i < individualSegments.length) {
        const currentSeg = individualSegments[i];

        if (currentSeg.distance >= LARGE_THRESHOLD) {
            groupedSegments.push({
                type: 'individual',
                startIndex: i,
                endIndex: i,
                segments: [currentSeg],
                totalDistance: currentSeg.distance,
                count: 1
            });
            i++;
            continue;
        }

        const similarSegments = [currentSeg];
        let j = i + 1;

        while (j < individualSegments.length) {
            const nextSeg = individualSegments[j];

            if (nextSeg.distance >= LARGE_THRESHOLD) {
                break;
            }

            const avgDistance = (currentSeg.distance + nextSeg.distance) / 2;
            const difference = Math.abs(currentSeg.distance - nextSeg.distance);
            const percentDiff = difference / avgDistance;

            if (percentDiff <= SIZE_TOLERANCE) {
                similarSegments.push(nextSeg);
                j++;
            } else {
                break;
            }
        }

        if (similarSegments.length >= MIN_SEGMENTS_TO_GROUP) {
            const totalDist = similarSegments.reduce((sum, seg) => sum + seg.distance, 0);
            groupedSegments.push({
                type: 'grouped',
                startIndex: i,
                endIndex: j - 1,
                segments: similarSegments,
                totalDistance: totalDist,
                count: similarSegments.length,
                avgSegmentSize: totalDist / similarSegments.length
            });
            i = j;
        } else {
            groupedSegments.push({
                type: 'individual',
                startIndex: i,
                endIndex: i,
                segments: [currentSeg],
                totalDistance: currentSeg.distance,
                count: 1
            });
            i++;
        }
    }

    ctx.strokeStyle = '#7f8c8d';
    ctx.lineWidth = 1;
    ctx.font = 'bold 9px Arial';
    ctx.fillStyle = '#2c3e50';

    for (let i = 0; i < latlngs.length; i++) {
        const nextIndex = (i + 1) % latlngs.length;
        const p1 = points[i];
        const p2 = points[nextIndex];

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }

    groupedSegments.forEach(group => {
        if (group.type === 'individual') {
            const i = group.startIndex;
            const nextIndex = (i + 1) % latlngs.length;
            const p1 = points[i];
            const p2 = points[nextIndex];

            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;

            ctx.save();
            ctx.translate(midX, midY);

            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            ctx.rotate(angle);

            const dimensionText = `${group.totalDistance.toFixed(2)}m`;
            const textWidth = ctx.measureText(dimensionText).width;

            if (Math.abs(angle) > Math.PI / 2) {
                ctx.rotate(Math.PI);
                ctx.fillText(dimensionText, -textWidth / 2, -3);
            } else {
                ctx.fillText(dimensionText, -textWidth / 2, -3);
            }

            ctx.restore();

        } else if (group.type === 'grouped') {
            const startIdx = group.startIndex;
            const endIdx = (group.endIndex + 1) % latlngs.length;

            const p1 = points[startIdx];
            const p2 = points[endIdx];

            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);

            const perpX = -dy / length;
            const perpY = dx / length;

            const offsetDistance = 15;
            const labelX = midX + perpX * offsetDistance;
            const labelY = midY + perpY * offsetDistance;

            ctx.save();
            ctx.translate(labelX, labelY);

            const angle = Math.atan2(dy, dx);
            ctx.rotate(angle);

            const dimensionText = `${group.totalDistance.toFixed(2)}m`;
            const textWidth = ctx.measureText(dimensionText).width;

            if (Math.abs(angle) > Math.PI / 2) {
                ctx.rotate(Math.PI);
                ctx.fillText(dimensionText, -textWidth / 2, -3);
            } else {
                ctx.fillText(dimensionText, -textWidth / 2, -3);
            }

            ctx.restore();
        }
    });

    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';

    let area = 0;
    let centroidX = 0;
    let centroidY = 0;

    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        const crossProduct = points[i].x * points[j].y - points[j].x * points[i].y;
        area += crossProduct;
        centroidX += (points[i].x + points[j].x) * crossProduct;
        centroidY += (points[i].y + points[j].y) * crossProduct;
    }

    area *= 0.5;
    centroidX /= (6 * area);
    centroidY /= (6 * area);

    if (centroidX < margin || centroidX > canvas.width - margin ||
        centroidY < margin || centroidY > canvas.height - margin) {
        centroidX = 0;
        centroidY = 0;
        points.forEach(point => {
            centroidX += point.x;
            centroidY += point.y;
        });
        centroidX /= points.length;
        centroidY /= points.length;
    }

    const loteNumber = lote.loteNumero || lote.name.replace(/\D+/g, '');

    const circleRadius = 18;
    ctx.fillStyle = '#4285F4';
    ctx.beginPath();
    ctx.arc(centroidX, centroidY, circleRadius, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(loteNumber, centroidX, centroidY);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
}

function calculateArea(latlngs) {
    let area = 0;
    const R = 6371000;

    for (let i = 0; i < latlngs.length; i++) {
        const p1 = latlngs[i];
        const p2 = latlngs[(i + 1) % latlngs.length];

        const lat1 = p1.lat * Math.PI / 180;
        const lat2 = p2.lat * Math.PI / 180;
        const lng1 = p1.lng * Math.PI / 180;
        const lng2 = p2.lng * Math.PI / 180;

        area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }

    return Math.abs(area * R * R / 2);
}

function calculatePerimeter(latlngs) {
    let perimeter = 0;

    for (let i = 0; i < latlngs.length; i++) {
        const p1 = latlngs[i];
        const p2 = latlngs[(i + 1) % latlngs.length];

        perimeter += p1.distanceTo(p2);
    }

    return perimeter;
}

function createExpandedVertices(vertices, bulges) {
    if (!vertices || vertices.length === 0) return [];

    const expandedVertices = [];
    const segments = 32;

    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        const bulge = bulges[i] || 0;

        expandedVertices.push(v1);

        if (Math.abs(bulge) > 0.0001) {
            const dx = v2.x - v1.x;
            const dy = v2.y - v1.y;
            const chordLength = Math.sqrt(dx * dx + dy * dy);

            if (chordLength > 0.0001) {
                // Calcular el ángulo incluido
                const includedAngle = 4 * Math.atan(bulge);

                // Radio del arco usando la fórmula correcta
                const radius = chordLength / (2 * Math.sin(Math.abs(includedAngle) / 2));

                // Punto medio de la cuerda
                const chordMidX = (v1.x + v2.x) / 2;
                const chordMidY = (v1.y + v2.y) / 2;

                // Ángulo de la cuerda
                const chordAngle = Math.atan2(dy, dx);

                // Distancia del centro al punto medio de la cuerda (altura h)
                const h = Math.sqrt(radius * radius - (chordLength / 2) * (chordLength / 2));

                // Ángulo perpendicular
                const perpAngle = chordAngle + Math.PI / 2;

                // Centro del arco - ajustar según signo del bulge
                const centerX = chordMidX + h * Math.cos(perpAngle) * Math.sign(bulge);
                const centerY = chordMidY + h * Math.sin(perpAngle) * Math.sign(bulge);

                // Calcular ángulos
                let startAngle = Math.atan2(v1.y - centerY, v1.x - centerX);
                let endAngle = Math.atan2(v2.y - centerY, v2.x - centerX);

                // Normalizar ángulos
                const normalizeAngle = (angle) => {
                    while (angle > Math.PI) angle -= 2 * Math.PI;
                    while (angle < -Math.PI) angle += 2 * Math.PI;
                    return angle;
                };

                startAngle = normalizeAngle(startAngle);
                endAngle = normalizeAngle(endAngle);

                // Determinar dirección basado en bulge
                if (bulge > 0) {
                    // Antihorario
                    if (endAngle <= startAngle) {
                        endAngle += 2 * Math.PI;
                    }
                } else {
                    // Horario
                    if (endAngle >= startAngle) {
                        endAngle -= 2 * Math.PI;
                    }
                }

                // Generar puntos intermedios
                const angleStep = (endAngle - startAngle) / segments;

                for (let j = 1; j < segments; j++) {
                    const angle = startAngle + angleStep * j;
                    const x = centerX + radius * Math.cos(angle);
                    const y = centerY + radius * Math.sin(angle);
                    expandedVertices.push({ x: x, y: y });
                }
            }
        }
    }

    return expandedVertices;
}

function calculateAreaDXF(vertices, bulges) {
    if (!vertices || vertices.length < 3) return 0;

    let area = 0;

    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];

        area += (v1.x * v2.y - v2.x * v1.y);
    }

    return Math.abs(area / 2);
}

function clearView() {
    dxfLayer.clearLayers();
    lotesLayer.clearLayers();
    manzanosLayer.clearLayers();

    manzanosData = {};
    lotesData = {};
    selectedLote = null;
    allBounds = null;

    document.getElementById('lot-data-content').innerHTML = `
                <div class="empty-lote-data">
                    <i class="fas fa-mouse-pointer"></i>
                    Selecciona un lote para ver sus datos
                </div>
            `;

    const canvas = document.getElementById('lot-plan-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    updateManzanosList();
    updateLotesList();
    updateStatistics();

    showNotification('Vista limpiada correctamente', 'info');
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const messageElement = notification.querySelector('.notification-message');
    const iconElement = notification.querySelector('.notification-icon i');

    messageElement.textContent = message;

    notification.className = 'notification ' + type;

    if (type === 'success') {
        iconElement.className = 'fas fa-check-circle';
    } else if (type === 'error') {
        iconElement.className = 'fas fa-exclamation-circle';
    } else {
        iconElement.className = 'fas fa-info-circle';
    }

    notification.classList.add('show');

    setTimeout(() => {
        hideNotification();
    }, 5000);
}

function hideNotification() {
    const notification = document.getElementById('notification');
    notification.classList.remove('show');
}

function dedupeClosedRing(arr, getX, getY, eps = 1e-6) {
    if (!arr || arr.length < 2) return arr || [];
    const result = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
        const prev = result[result.length - 1];
        if (Math.hypot(getX(arr[i]) - getX(prev), getY(arr[i]) - getY(prev)) > eps) {
            result.push(arr[i]);
        }
    }
    while (
        result.length > 1 &&
        Math.hypot(
            getX(result[result.length - 1]) - getX(result[0]),
            getY(result[result.length - 1]) - getY(result[0])
        ) <= eps
    ) {
        result.pop();
    }
    return result;
}

function convertDXFToLatLng(vertex, coordSystem, utmZone, hemisphere, refLat, refLng, scale) {
    const x = vertex.x || 0, y = vertex.y || 0;

    if (coordSystem === 'utm') {
        try {
            const utmProj = hemisphere === 'south'
                ? `+proj=utm +zone=${utmZone} +south +datum=WGS84 +units=m +no_defs`
                : `+proj=utm +zone=${utmZone} +datum=WGS84 +units=m +no_defs`;
            const wgs84 = '+proj=longlat +datum=WGS84 +no_defs';
            const result = proj4(utmProj, wgs84, [x, y]);
            return [result[1], result[0]];
        } catch (error) {
            console.error('Error en conversión UTM:', error);
            if (Math.abs(x) > 1000 || Math.abs(y) > 1000) {
                const adjustedX = x - 500000;
                const lat = y / 111320;
                const lng = (adjustedX / (111320 * Math.cos(lat * Math.PI / 180)));
                return [lat, lng - 66];
            } else {
                return [refLat + (y * scale), refLng + (x * scale)];
            }
        }
    } else {
        if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
            return [y, x];
        } else if (Math.abs(x) > 1 && Math.abs(y) > 1) {
            const lat = y / 111320;
            const lng = x / (111320 * Math.cos(lat * Math.PI / 180));
            return [lat, lng];
        } else {
            return [refLat + (y * scale), refLng + (x * scale)];
        }
    }
}

function getColorFromDXF(colorIndex) {
    const colors = {
        1: '#FF0000', 2: '#FFFF00', 3: '#00FF00', 4: '#00FFFF', 5: '#0000FF',
        6: '#FF00FF', 7: '#000000', 8: '#808080', 9: '#C0C0C0', 10: '#FF0000',
        30: '#FF7F00', 40: '#FF7F7F', 50: '#7F0000', 60: '#7F3F00', 70: '#7F7F00',
        80: '#00FF00', 90: '#007F00', 100: '#007F7F', 110: '#00FF7F', 120: '#00FFFF',
        130: '#007FFF', 140: '#0000FF', 150: '#7F00FF', 160: '#FF00FF', 170: '#FF007F',
        180: '#7F007F', 250: '#3F3F3F', 255: '#FFFFFF'
    };
    return colors[colorIndex] || '#000000';
}

function getLineWeightInPixels(lineweight) {
    if (!lineweight || lineweight === -1 || lineweight === -2) return 2;
    const mmValue = Math.abs(lineweight) / 100;
    return Math.max(1, Math.min(mmValue * 3, 10));
}

function createBulgeArc(v1, v2, bulge, coordSystem, utmZone, hemisphere, refLat, refLng, scale, segments = 64) {
    const points = [];
    if (Math.abs(bulge) < 0.00001) return points;

    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const chordLength = Math.sqrt(dx * dx + dy * dy);

    if (chordLength < 0.0001) return points;

    // Calcular el ángulo incluido correctamente
    const includedAngle = 4 * Math.atan(bulge);

    // Radio del arco usando la fórmula correcta
    const radius = chordLength / (2 * Math.sin(Math.abs(includedAngle) / 2));

    // Punto medio de la cuerda
    const chordMidX = (v1.x + v2.x) / 2;
    const chordMidY = (v1.y + v2.y) / 2;

    // Ángulo de la cuerda
    const chordAngle = Math.atan2(dy, dx);

    // Distancia del centro al punto medio de la cuerda
    const h = Math.sqrt(radius * radius - (chordLength / 2) * (chordLength / 2));

    // Ángulo perpendicular a la cuerda
    const perpAngle = chordAngle + Math.PI / 2;

    // Centro del arco - ajustar según el signo del bulge
    const centerX = chordMidX + h * Math.cos(perpAngle) * Math.sign(bulge);
    const centerY = chordMidY + h * Math.sin(perpAngle) * Math.sign(bulge);

    // Calcular ángulos inicial y final desde el centro
    let startAngle = Math.atan2(v1.y - centerY, v1.x - centerX);
    let endAngle = Math.atan2(v2.y - centerY, v2.x - centerX);

    // Normalizar ángulos entre -PI y PI
    const normalizeAngle = (angle) => {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    };

    startAngle = normalizeAngle(startAngle);
    endAngle = normalizeAngle(endAngle);

    // Determinar dirección del arco basado en el bulge
    if (bulge > 0) {
        // Sentido antihorario
        if (endAngle <= startAngle) {
            endAngle += 2 * Math.PI;
        }
    } else {
        // Sentido horario
        if (endAngle >= startAngle) {
            endAngle -= 2 * Math.PI;
        }
    }

    // Generar puntos del arco
    const angleStep = (endAngle - startAngle) / segments;

    for (let i = 1; i < segments; i++) {
        const angle = startAngle + angleStep * i;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        points.push(convertDXFToLatLng({ x, y }, coordSystem, utmZone, hemisphere, refLat, refLng, scale));
    }

    return points;
}

function toggleControls3D() {
    const controls = document.querySelector('.controls-3d');
    if (controls) {
        if (controls.style.display === 'none') {
            controls.style.display = 'block';
        } else {
            controls.style.display = 'none';
        }
    } else {
        console.warn('Elemento .controls-3d no encontrado');
    }
}

function updateCoordinates3D() {
    if (is3DViewActive) {
        const coordsElement = document.querySelector('.coordinates-3d');
        if (coordsElement) {
            // Mostrar posición de la cámara
            coordsElement.textContent = `X: ${camera3D.position.x.toFixed(2)}, Y: ${camera3D.position.y.toFixed(2)}, Z: ${camera3D.position.z.toFixed(2)}`;
        } else {
            console.warn('Elemento .coordinates-3d no encontrado');
        }
    }
}
