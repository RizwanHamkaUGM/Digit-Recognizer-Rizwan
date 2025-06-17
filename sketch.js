const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const predictButton = document.getElementById('predictButton');
const clearBtn = document.getElementById('clearBtn');
const resultSpan = document.getElementById('result');
const outputContainer = document.querySelector('.output-container');
const confidenceContainer = document.getElementById('confidence-container');
const confidencePlaceholder = document.querySelector('.confidence-placeholder');

const MNIST_SIZE = 28;
const CANVAS_SIZE = 420; 
const CELL_SIZE = CANVAS_SIZE / MNIST_SIZE;

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


function applyBrush(col, row, intensity = .45) {
    const brushSize = 2; 

    for (let i = -brushSize; i <= brushSize; i++) {
        for (let j = -brushSize; j <= brushSize; j++) {
            const c = col + i;
            const r = row + j;
            if (c >= 0 && c < MNIST_SIZE && r >= 0 && r < MNIST_SIZE) {
                const distance = Math.sqrt(i * i + j * j);
                
                if (distance < brushSize) {
                    const value = intensity * (1 - (distance / brushSize));
                    grid[c][r] = constrain(grid[c][r] + value, 0, 1);
                }
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

function handleStart(e) { e.preventDefault(); isMouseDown = true; getPos(e); }
function handleMove(e) { e.preventDefault(); if (isMouseDown) getPos(e); }
function handleEnd() { isMouseDown = false; }

function clearCanvas() {
    grid = make2DArray(MNIST_SIZE, MNIST_SIZE);
    resultSpan.textContent = '...';
    confidenceContainer.innerHTML = '<p class="confidence-placeholder">Hasil probabilitas akan muncul di sini setelah Anda menggambar dan menekan tombol prediksi.</p>';
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

function getBoundingBox(grid) {
    let minX = MNIST_SIZE, minY = MNIST_SIZE, maxX = -1, maxY = -1;
    for (let i = 0; i < MNIST_SIZE; i++) {
        for (let j = 0; j < MNIST_SIZE; j++) {
            if (grid[i][j] > 0.1) {
                if (i < minX) minX = i; if (i > maxX) maxX = i;
                if (j < minY) minY = j; if (j > maxY) maxY = j;
            }
        }
    }
    if (maxX === -1) return null;
    return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function getCenterOfMass(grid, box) {
    let totalMass = 0, sumX = 0, sumY = 0;
    for (let i = box.minX; i <= box.maxX; i++) {
        for (let j = box.minY; j <= box.maxY; j++) {
            const mass = grid[i][j];
            totalMass += mass;
            sumX += i * mass;
            sumY += j * mass;
        }
    }
    return { x: sumX / totalMass, y: sumY / totalMass };
}

function normalizeAndCenter(grid) {
    const box = getBoundingBox(grid);
    if (!box) return grid;

    const digit = make2DArray(box.width, box.height);
    for (let i = 0; i < box.width; i++) {
        for (let j = 0; j < box.height; j++) {
            digit[i][j] = grid[box.minX + i][box.minY + j];
        }
    }

    const center = getCenterOfMass(digit, { minX: 0, minY: 0, maxX: box.width - 1, maxY: box.height - 1 });

    const newGrid = make2DArray(MNIST_SIZE, MNIST_SIZE);

    const offsetX = Math.round((MNIST_SIZE / 2) - center.x);
    const offsetY = Math.round((MNIST_SIZE / 2) - center.y);

    for (let i = 0; i < box.width; i++) {
        for (let j = 0; j < box.height; j++) {
            const newX = i + offsetX;
            const newY = j + offsetY;
            if (newX >= 0 && newX < MNIST_SIZE && newY >= 0 && newY < MNIST_SIZE) {
                newGrid[newX][newY] = digit[i][j];
            }
        }
    }
    return newGrid;
}


function smoothGrid(grid) {
    const kernel = [[0.0625, 0.125, 0.0625], [0.125, 0.25, 0.125], [0.0625, 0.125, 0.0625]];
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

function updateConfidenceBars(confidence, prediction) {
    confidenceContainer.innerHTML = ''; 
    for (let i = 0; i < 10; i++) {
        const prob = confidence[i];
        const percentage = (prob * 100);

        const item = document.createElement('div');
        item.className = 'confidence-item';

        if (i === prediction) {
            item.classList.add('predicted');
        }

        const label = document.createElement('div');
        label.className = 'confidence-label';
        label.textContent = i;

        const barContainer = document.createElement('div');
        barContainer.className = 'confidence-bar-container';

        const bar = document.createElement('div');
        bar.className = 'confidence-bar';
        setTimeout(() => {
            bar.style.width = `${percentage}%`;
        }, 10);
        bar.textContent = `${percentage.toFixed(1)}%`;
        
        barContainer.appendChild(bar);
        item.appendChild(label);
        item.appendChild(barContainer);
        confidenceContainer.appendChild(item);
    }
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
    let processedGrid = normalizeAndCenter(grid);
    processedGrid = smoothGrid(processedGrid);
    processedGrid = normalizeIntensity(processedGrid);
    
    const data = [];
    for (let j = 0; j < MNIST_SIZE; j++) { 
        for (let i = 0; i < MNIST_SIZE; i++) { 
            data.push(Math.round((processedGrid[i][j] || 0) * 255));
        }
    }
    
    predictButton.disabled = true;
    predictButton.textContent = 'Memprediksi...';

    try {
        const response = await fetch('https://flask-digit-recognizer-v2.vercel.app/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_data: data }),
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const responseData = await response.json();
        
        resultSpan.textContent = responseData.prediction;
        updateConfidenceBars(responseData.confidence, responseData.prediction);
        outputContainer.classList.add('visible'); 

    } catch (error) {
        console.error('Error during prediction:', error);
        resultSpan.textContent = 'Err';
        outputContainer.classList.add('visible');
    } finally {
        predictButton.disabled = false;
        predictButton.textContent = 'Prediksi Angka';
    }
});

setup();
gameLoop();
