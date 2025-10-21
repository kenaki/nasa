import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

const firebaseConfig = {
    apiKey: 
    databaseURL: "https://stellarfarmers-a849d-default-rtdb.firebaseio.com",
};

const googleApiKey = "AIzaSyDgJAElA3fsD-bZ-LXMVJpGd_4cbglLV2U";
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

async function addressToFips(address) {
    const { lat, lng } = await getCoordinates(address);
    return await getFipsFromCoordinates(lat, lng);
}

async function getCoordinates(address) {
    const baseUrl = "https://maps.googleapis.com/maps/api/geocode/json";
    const url = `${baseUrl}?address=${encodeURIComponent(address)}&key=${googleApiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status === "OK") {
        return data.results[0].geometry.location;
    }
    throw new Error(`Geocoding failed: ${data.status}`);
}

async function getFipsFromCoordinates(lat, lng) {
    const baseUrl = "https://geo.fcc.gov/api/census/block/find";
    const url = `${baseUrl}?latitude=${lat}&longitude=${lng}&format=json`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.County) {
        return data.County.FIPS;
    }
    throw new Error("FIPS code not found in response");
}




function createSelectors() {
    const container = document.createElement('div');
    container.innerHTML = `
        <div id="addressDisplay" style="text-align: center; font-size: 18px; margin: 20px 0;"></div>
        <select id="cropSelector">
            <option value="Corn">Corn</option>
            <option value="Cotton">Cotton</option>
            <option value="WinterWheat">Winter Wheat</option>
        </select>
        <select id="yearSelector">
            ${[2017, 2018, 2019, 2020, 2021, 2022].map(year => 
                `<option value="${year}">${year}</option>`
            ).join('')}
        </select>
        <button id="updateButton">Update Dashboard</button>
    `;
    document.body.insertBefore(container, document.getElementById('dashboard'));

    document.getElementById('updateButton').addEventListener('click', updateDashboard);
}


async function updateDashboard() {
    const cropSelector = document.getElementById('cropSelector');
    const yearSelector = document.getElementById('yearSelector');
    const addressDisplay = document.getElementById('addressDisplay');
    
    if (!cropSelector || !yearSelector || !addressDisplay) {
        console.error('One or more required elements not found');
        return;
    }
    
    const crop = cropSelector.value;
    const year = yearSelector.value;
    const fips = addressDisplay.dataset.fips;
    
    if (!crop || !year || !fips) {
        console.error('Missing required data:', { crop, year, fips });
        return;
    }
    
    await getCropDataForYear(fips, crop, year);
}

const dataCache = {};

async function getCropDataForYear(fipsCode, crop, year) {
    const cacheKey = `${fipsCode}_${crop}_${year}`;
    
    if (dataCache[cacheKey]) {
        console.log('Using cached data');
        return processAndVisualizeData(dataCache[cacheKey], year, crop);
    }
    
    console.log(`Retrieving data for FIPS: ${fipsCode}, Crop: ${crop}, Year: ${year}`);
    
    const cropYearRef = ref(database, `${fipsCode}/${crop}/${year}`);
    
    try {
        const snapshot = await get(cropYearRef);
        if (snapshot.exists()) {
            const data = snapshot.val();
            dataCache[cacheKey] = data;  // Cache the data
            console.log(`Data for ${crop} in ${year} under FIPS ${fipsCode}:`, data);
            processAndVisualizeData(data, year, crop);
        } else {
            console.log(`No data available for ${crop} in ${year} under FIPS ${fipsCode}`);
        }
    } catch (error) {
        console.error("Error retrieving data:", error);
    }
}

function processAndVisualizeData(data, year, crop) {
    console.log(`Processing data for ${crop} in ${year}`);
    
    const monthlyData = Object.keys(data).map(month => {
        const monthData = data[month][0];
        return {
            month: month,
            avgTemp: parseFloat(monthData['Avg Temperature (K)']),
            revenue: parseInt(monthData['Revenue']),
            windSpeed: parseFloat(monthData['Wind Speed (m s**-1)']),
            windGust: parseFloat(monthData['Wind Gust (m s**-1)']),
            seedCost: parseInt(monthData['Seed Cost']),
            fertilizerCost: parseInt(monthData['Fertilizer Cost'])
        };
    }).sort((a, b) => a.month.localeCompare(b.month));

    console.log("Processed Monthly Data:", monthlyData);
    initializeDashboard(monthlyData, year, crop);
}
function initializeDashboard(monthlyData, year, crop) {
    const dashboard = document.getElementById('dashboard');
    const graphContainer = document.getElementById('graphContainer');
    const graphCanvas = document.getElementById('graphCanvas');
    let chart;

    function createCard(title, value) {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-header">${title}</div>
            <div class="card-value">${value}</div>
        `;
        card.addEventListener('click', () => showGraph(title));
        return card;
    }

    function calculateAverage(key) {
        return (monthlyData.reduce((sum, month) => sum + month[key], 0) / monthlyData.length).toFixed(2);
    }

    function calculateTotal(key) {
        return monthlyData.reduce((sum, month) => sum + month[key], 0).toLocaleString();
    }

    const cardData = [
        { title: 'Avg Temperature', value: `${calculateAverage('avgTemp')} K` },
        { title: 'Avg Wind Speed', value: `${calculateAverage('windSpeed')} m/s` },
        { title: 'Avg Wind Gust', value: `${calculateAverage('windGust')} m/s` },
        { title: 'Total Revenue', value: `$${calculateTotal('revenue')}` },
        { title: 'Total Seed Cost', value: `$${calculateTotal('seedCost')}` },
        { title: 'Total Fertilizer Cost', value: `$${calculateTotal('fertilizerCost')}` },
    ];

    dashboard.innerHTML = '';
    cardData.forEach(card => dashboard.appendChild(createCard(card.title, card.value)));
    function resetCanvas() {
        const graphContainer = document.getElementById('graphContainer');
        const oldCanvas = document.getElementById('graphCanvas');
        const newCanvas = document.createElement('canvas');
        newCanvas.id = 'graphCanvas';
        if (oldCanvas) {
            oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
        } else {
            graphContainer.appendChild(newCanvas);
        }
        return newCanvas.getContext('2d');
    }
    
    // Modify your showGraph function to use resetCanvas
    let currentChart = null;
    
    function showGraph(title) {
        const graphContainer = document.getElementById('graphContainer');
        graphContainer.style.display = 'block';
        
        // Reset the canvas and get the new context
        const ctx = resetCanvas();
        
        // Determine which key to use for the data
        let key;
        switch (title) {
            case 'Avg Temperature':
                key = 'avgTemp';
                break;
            case 'Avg Wind Speed':
                key = 'windSpeed';
                break;
            case 'Avg Wind Gust':
                key = 'windGust';
                break;
            case 'Total Revenue':
                key = 'revenue';
                break;
            case 'Total Seed Cost':
                key = 'seedCost';
                break;
            case 'Total Fertilizer Cost':
                key = 'fertilizerCost';
                break;
            default:
                console.error('Unknown title:', title);
                return;
        }
        
        // Create the new chart
        currentChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: monthlyData.map(d => d.month),
                datasets: [{
                    label: title,
                    data: monthlyData.map(d => d[key]),
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Monthly ${title} for ${crop} in ${year}`
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false
                    }
                }
            }
        });
    }
}

    


document.addEventListener('DOMContentLoaded', async function() {
    createSelectors();
    const urlParams = new URLSearchParams(window.location.search);
    const address = urlParams.get('address');
    
    if (address) {
        const addressDisplay = document.getElementById('addressDisplay');
        if (!addressDisplay) {
            console.error('addressDisplay element not found');
            return;
        }
        addressDisplay.textContent = `Address: ${address}`;
        try {
            const fips = await addressToFips(address);
            addressDisplay.dataset.fips = fips;
            console.log(`FIPS code for ${address}: ${fips}`);
            await getCropDataForYear(fips, "Corn", "2022");
        } catch (error) {
            console.error("Error converting address to FIPS:", error);
            addressDisplay.textContent += " (Error: Unable to determine FIPS code)";
        }
    } else {
        console.error('No address provided in URL parameters');
    }
});
