const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const predictButton = document.getElementById('predictButton');
const clearBtn = document.getElementById('clearBtn');
const resultSpan = document.getElementById('result');

// MNIST menggunakan 28x28 pixels
const MNIST_SIZE = 28;
const CANVAS_SIZE = 420; // 28 * 15 untuk scaling yang baik
const CELL_SIZE = CANVAS_SIZE / MNIST_SIZE; // 15px per cell

let grid = [];
let isMouseDown = false;

function make2DArray(cols, rows) {
    let arr = new Array(cols);
    for (let i = 0; i < arr.length; i++) {
        arr[i] = new Array(rows).fill(0);
    }
    return arr;
}

function constrain(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

function setup() {
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    grid = make2DArray(MNIST_SIZE, MNIST_SIZE);
}

function applyBrush(col, row, intensity = 1.0) {
    // Brush dengan falloff yang lebih halus untuk meniru pensil/marker
    const brushSize = 1; // Radius brush
    
    for (let i = -brushSize; i <= brushSize; i++) {
        for (let j = -brushSize; j <= brushSize; j++) {
            const c = col + i;
            const r = row + j;
            if (c >= 0 && c < MNIST_SIZE && r >= 0 && r < MNIST_SIZE) {
                const distance = Math.sqrt(i * i + j * j);
                let value;
                
                if (distance <= 0.5) {
                    value = intensity; // Center pixel
                } else if (distance <= 1.0) {
                    value = intensity * 0.8; // Adjacent pixels
                } else {
                    value = intensity * 0.4; // Diagonal pixels
                }
                
                grid[c][r] = constrain(grid[c][r] + value, 0, 1);
            }
        }
    }
}

function getPos(event) {
    const rect = canvas.getBoundingClientRect();
    const clientX = event.clientX || event.touches[0].clientX;
    const clientY = event.clientY || event.touches[0].clientY;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;
    
    const mouseCol = Math.floor(canvasX / CELL_SIZE);
    const mouseRow = Math.floor(canvasY / CELL_SIZE);
    
    applyBrush(mouseCol, mouseRow);
}

function handleStart(e) { 
    e.preventDefault(); 
    isMouseDown = true; 
    getPos(e); 
}

function handleMove(e) { 
    e.preventDefault(); 
    if (isMouseDown) getPos(e); 
}

function handleEnd() { 
    isMouseDown = false; 
}

function clearCanvas() {
    grid = make2DArray(MNIST_SIZE, MNIST_SIZE);
    resultSpan.textContent = '...';
    draw();
}

function draw() {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    for (let i = 0; i < MNIST_SIZE; i++) {
        for (let j = 0; j < MNIST_SIZE; j++) {
            const val = grid[i][j];
            if (val > 0) {
                const gray = Math.floor(val * 255);
                ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
                ctx.fillRect(i * CELL_SIZE, j * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
        }
    }
}

function gameLoop() {
    draw();
    requestAnimationFrame(gameLoop);
}

// === ADVANCED IMAGE PROCESSING FOR MNIST COMPATIBILITY ===

function getBoundingBox(grid) {
    let minX = MNIST_SIZE, minY = MNIST_SIZE, maxX = -1, maxY = -1;
    
    for (let i = 0; i < MNIST_SIZE; i++) {
        for (let j = 0; j < MNIST_SIZE; j++) {
            if (grid[i][j] > 0.1) { // Threshold untuk noise
                if (i < minX) minX = i;
                if (i > maxX) maxX = i;
                if (j < minY) minY = j;
                if (j > maxY) maxY = j;
            }
        }
    }
    
    if (maxX === -1) return null; // Kosong
    return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function getCenterOfMass(grid, box) {
    let totalMass = 0;
    let sumX = 0, sumY = 0;

    for (let i = box.minX; i <= box.maxX; i++) {
        for (let j = box.minY; j <= box.maxY; j++) {
            const mass = grid[i][j];
            totalMass += mass;
            sumX += i * mass;
            sumY += j * mass;
        }
    }
    
    return { 
        x: sumX / totalMass, 
        y: sumY / totalMass 
    };
}

function normalizeAndCenter(grid) {
    const box = getBoundingBox(grid);
    if (!box) return grid; // Kanvas kosong

    const center = getCenterOfMass(grid, box);
    const newGrid = make2DArray(MNIST_SIZE, MNIST_SIZE);

    // Hitung scaling factor agar digit tidak terlalu besar atau kecil
    const maxDimension = Math.max(box.width, box.height);
    const targetSize = Math.min(20, maxDimension); // MNIST digits biasanya 20-22 pixels
    const scale = maxDimension > targetSize ? targetSize / maxDimension : 1.0;

    // Hitung offset untuk centering
    const targetCenterX = (MNIST_SIZE - 1) / 2;
    const targetCenterY = (MNIST_SIZE - 1) / 2;
    
    const offsetX = targetCenterX - center.x * scale;
    const offsetY = targetCenterY - center.y * scale;

    // Copy dan scale pixel
    for (let i = 0; i < MNIST_SIZE; i++) {
        for (let j = 0; j < MNIST_SIZE; j++) {
            if (grid[i][j] > 0) {
                const newX = Math.round(i * scale + offsetX);
                const newY = Math.round(j * scale + offsetY);
                
                if (newX >= 0 && newX < MNIST_SIZE && newY >= 0 && newY < MNIST_SIZE) {
                    newGrid[newX][newY] = Math.max(newGrid[newX][newY], grid[i][j]);
                }
            }
        }
    }

    return newGrid;
}

function smoothGrid(grid) {
    // Gaussian blur untuk mengurangi noise dan membuat lebih smooth
    const kernel = [
        [0.0625, 0.125, 0.0625],
        [0.125,  0.25,  0.125],
        [0.0625, 0.125, 0.0625]
    ];
    
    const newGrid = make2DArray(MNIST_SIZE, MNIST_SIZE);
    
    for (let i = 1; i < MNIST_SIZE - 1; i++) {
        for (let j = 1; j < MNIST_SIZE - 1; j++) {
            let sum = 0;
            for (let ki = -1; ki <= 1; ki++) {
                for (let kj = -1; kj <= 1; kj++) {
                    sum += grid[i + ki][j + kj] * kernel[ki + 1][kj + 1];
                }
            }
            newGrid[i][j] = sum;
        }
    }
    
    return newGrid;
}

function normalizeIntensity(grid) {
    // Normalisasi intensitas untuk konsistensi dengan MNIST
    let maxVal = 0;
    for (let i = 0; i < MNIST_SIZE; i++) {
        for (let j = 0; j < MNIST_SIZE; j++) {
            maxVal = Math.max(maxVal, grid[i][j]);
        }
    }
    
    if (maxVal === 0) return grid;
    
    const newGrid = make2DArray(MNIST_SIZE, MNIST_SIZE);
    for (let i = 0; i < MNIST_SIZE; i++) {
        for (let j = 0; j < MNIST_SIZE; j++) {
            newGrid[i][j] = grid[i][j] / maxVal;
        }
    }
    
    return newGrid;
}

// === EVENT LISTENERS ===

canvas.addEventListener('mousedown', handleStart);
canvas.addEventListener('mousemove', handleMove);
canvas.addEventListener('mouseup', handleEnd);
canvas.addEventListener('mouseleave', handleEnd);
canvas.addEventListener('touchstart', handleStart);
canvas.addEventListener('touchmove', handleMove);
canvas.addEventListener('touchend', handleEnd);
canvas.addEventListener('touchcancel', handleEnd);

clearBtn.addEventListener('click', clearCanvas);

predictButton.addEventListener('click', async () => {
    // === COMPREHENSIVE IMAGE PROCESSING PIPELINE ===
    
    // 1. Normalisasi dan centering
    let processedGrid = normalizeAndCenter(grid);
    
    // 2. Smoothing untuk mengurangi noise
    processedGrid = smoothGrid(processedGrid);
    
    // 3. Normalisasi intensitas final
    processedGrid = normalizeIntensity(processedGrid);
    
    // 4. Convert ke format MNIST (28x28 array, row-major order)
    const data = [];
    for (let j = 0; j < MNIST_SIZE; j++) { // Row-major order (y first)
        for (let i = 0; i < MNIST_SIZE; i++) { // Then x
            const value = processedGrid[i][j] || 0;
            const mnistValue = Math.round(value * 255); // 0-255 range
            data.push(mnistValue);
        }
    }
    
    resultSpan.textContent = '...';
    predictButton.disabled = true;
    predictButton.textContent = 'Memprediksi...';

    try {
        const response = await fetch('https://flask-digit-recognizer.vercel.app/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_data: data }),
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const responseData = await response.json();
        resultSpan.textContent = responseData.prediction;
    } catch (error) {
        console.error('Error during prediction:', error);
        resultSpan.textContent = 'Error';
    } finally {
        predictButton.disabled = false;
        predictButton.textContent = 'Prediksi Angka';
    }
});

setup();
gameLoop();