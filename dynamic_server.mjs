import * as fs from 'node:fs';
import * as path from 'node:path';
import { default as express } from "express";
import { default as sqlite3 } from "sqlite3";

let port = 8080;
let public_dir = './public';
let template_dir = './templates';

let app = express();
app.use(express.static(public_dir));

// open DB (read only as you had it)
const db = new sqlite3.Database('./electric_vehicles.db', sqlite3.OPEN_READONLY, (err) => {
    if (err){
        console.error('Error connecting to database:', err.message);
    } else {
        console.log("Successfully connected to: database");
    }
});

// helper: get distinct column values (returns Promise)
function getDistinct(column) {
    return new Promise((resolve, reject) => {
        const sql = `SELECT DISTINCT ${column} AS val FROM electric_vehicles ORDER BY ${column} ASC;`;
        db.all(sql, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(r => r.val));
        });
    });
}

// helper: read template file (Promise)
function readTemplate(name) {
    return new Promise((resolve, reject) => {
        fs.readFile(path.join(template_dir, name), {encoding:'utf8'}, (err, data) => {
            if (err) return reject(err);
            resolve(data);
        });
    });
}

// render home: show vehicle types (same as your index but with nav bar)
app.get('/', async (req, res) => {
    try {
        const types = await getDistinct('Vehicle_Type');
        const type_list = types.map(t => `<li><a href="/vehicles/${encodeURIComponent(t)}">${t}</a></li>`).join('\n');
        const template = await readTemplate('index.html');
        const response = template.replace('$$$TYPE_LIST$$$', type_list);
        res.type('html').status(200).send(response);
    } catch (err) {
        console.error("Home error:", err.message);
        res.status(500).type('txt').send("Server Error");
    }
});

// Route: view all vehicles by type (existing, extended with prev/next and a chart)
app.get('/vehicles/:vehicle_type', async (req, res) => {
    const vehicleType = req.params.vehicle_type;
    // we include rowid to create optional detail links
    const sql = 'SELECT rowid, * FROM electric_vehicles WHERE Vehicle_Type = ? ORDER BY Year DESC, Make, Model;';
    db.all(sql, [vehicleType], async (err, rows) => {
        if (err){
            console.error("SQL ERROR:", err.message);
            return res.status(500).type('txt').send("SQL Error: " + err.message);
        }
        if (!rows || rows.length === 0) {
            // customized 404 for missing vehicle type
            return res.status(404).type('txt').send(`Error: no data for vehicle type "${vehicleType}"`);
        }

        try {
            // navigation lists (for header)
            const types = await getDistinct('Vehicle_Type');

            // build prev/next links for types
            const idx = types.indexOf(vehicleType);
            const prev = idx > 0 ? types[idx-1] : types[types.length-1]; // circle-around
            const next = idx < types.length-1 ? types[idx+1] : types[0];

            // build table rows and sample image fields (image src/alt placeholders)
            let vehicle_rows = '';
            const chartLabels = []; // years
            const chartData = [];   // average range per year for this vehicle type
            // We'll compute average range per year from rows
            const rangeByYear = {};
            for (let r of rows) {
                vehicle_rows += '<tr>';
                vehicle_rows += `<td><a href="/vehicle/${r.rowid}">${r.Make}</a></td>`;
                vehicle_rows += `<td>${r.Model}</td>`;
                vehicle_rows += `<td>${r.Year}</td>`;
                vehicle_rows += `<td><a href="/regions/${encodeURIComponent(r.Region)}">${r.Region}</a></td>`;
                vehicle_rows += `<td>${r.Range}</td>`;
                vehicle_rows += `<td>${r.Battery_Capacity ?? ''}</td>`;
                vehicle_rows += `<td>${r.Energy_Consumption ?? ''}</td>`;
                vehicle_rows += `<td>${r.C02_Saved ?? ''}</td>`;
                vehicle_rows += `<td><img src="/images/vehicles/${encodeURIComponent(r.Make)}_${encodeURIComponent(r.Model)}.jpg" alt="${r.Make} ${r.Model}" onerror="this.style.display='none'"/></td>`;
                vehicle_rows += '</tr>';

                // accumulate range by year for chart
                const yr = r.Year || 'Unknown';
                if (!rangeByYear[yr]) { rangeByYear[yr] = {sum:0,count:0}; }
                const numericRange = Number(r.Range);
                if (!isNaN(numericRange)) {
                    rangeByYear[yr].sum += numericRange;
                    rangeByYear[yr].count += 1;
                }
            }

            // prepare chart arrays sorted by year descending (or numeric)
            const yearsSorted = Object.keys(rangeByYear).sort((a,b) => Number(b) - Number(a));
            for (let y of yearsSorted) {
                const obj = rangeByYear[y];
                if (obj.count > 0) {
                    chartLabels.push(y);
                    chartData.push(Math.round((obj.sum / obj.count) * 100) / 100);
                }
            }

            const template = await readTemplate('vehicles.html');
            let response = template
                .replace('$$$VEHICLE_TYPE$$$', vehicleType)
                .replace('$$$VEHICLE_ROWS$$$', vehicle_rows)
                .replace('$$$NAV_TYPES$$$', types.map(t => `<a href="/vehicles/${encodeURIComponent(t)}">${t}</a>`).join(' | '))
                .replace('$$$PREV_LINK$$$', `/vehicles/${encodeURIComponent(prev)}`)
                .replace('$$$NEXT_LINK$$$', `/vehicles/${encodeURIComponent(next)}`)
                // embed chart data as JSON for client-side Chart.js rendering
                .replace('$$$CHART_LABELS$$$', JSON.stringify(chartLabels))
                .replace('$$$CHART_DATA$$$', JSON.stringify(chartData));

            res.type('html').status(200).send(response);
        } catch (ex) {
            console.error("vehicles route template error:", ex.message);
            res.status(500).type('txt').send("Server Error");
        }
    });
});

// Route: view by region
app.get('/regions/:region', (req, res) => {
    const region = req.params.region;
    const sql = 'SELECT rowid, * FROM electric_vehicles WHERE Region = ? ORDER BY Year DESC, Make, Model;';
    db.all(sql, [region], async (err, rows) => {
        if (err) {
            console.error("SQL ERROR:", err.message);
            return res.status(500).type('txt').send("SQL Error: " + err.message);
        }
        if (!rows || rows.length === 0) {
            return res.status(404).type('txt').send(`Error: no data for region "${region}"`);
        }

        try {
            const regions = await getDistinct('Region');
            const idx = regions.indexOf(region);
            const prev = idx > 0 ? regions[idx-1] : regions[regions.length-1];
            const next = idx < regions.length-1 ? regions[idx+1] : regions[0];

            let rowsHtml = '';
            for (let r of rows) {
                rowsHtml += '<tr>';
                rowsHtml += `<td>${r.Make}</td>`;
                rowsHtml += `<td>${r.Model}</td>`;
                rowsHtml += `<td>${r.Year}</td>`;
                rowsHtml += `<td>${r.Vehicle_Type}</td>`;
                rowsHtml += `<td>${r.Range}</td>`;
                rowsHtml += `<td>${r.Battery_Capacity ?? ''}</td>`;
                rowsHtml += '</tr>';
            }

            const template = await readTemplate('region.html');
            const response = template
                .replace('$$$REGION$$$', region)
                .replace('$$$REGION_ROWS$$$', rowsHtml)
                .replace('$$$NAV_REGIONS$$$', regions.map(r => `<a href="/regions/${encodeURIComponent(r)}">${r}</a>`).join(' | '))
                .replace('$$$PREV_LINK$$$', `/regions/${encodeURIComponent(prev)}`)
                .replace('$$$NEXT_LINK$$$', `/regions/${encodeURIComponent(next)}`);

            res.type('html').status(200).send(response);
        } catch (ex) {
            console.error("region route template error:", ex.message);
            res.status(500).type('txt').send("Server Error");
        }
    });
});

// Route: view by year
app.get('/years/:year', (req, res) => {
    const year = req.params.year;
    const sql = 'SELECT rowid, * FROM electric_vehicles WHERE Year = ? ORDER BY Make, Model;';
    db.all(sql, [year], async (err, rows) => {
        if (err) {
            console.error("SQL ERROR:", err.message);
            return res.status(500).type('txt').send("SQL Error: " + err.message);
        }
        if (!rows || rows.length === 0) {
            return res.status(404).type('txt').send(`Error: no data for year "${year}"`);
        }

        try {
            const years = await getDistinct('Year');
            const idx = years.indexOf(Number(year));
            // since getDistinct returns strings maybe, make sure matching:
            // fallback: compute index manually
            const yearsStr = years.map(y => String(y));
            const idx2 = yearsStr.indexOf(String(year));
            const finalIdx = idx >= 0 ? idx : idx2;
            const prevIdx = finalIdx > 0 ? finalIdx - 1 : years.length - 1;
            const nextIdx = finalIdx < years.length - 1 ? finalIdx + 1 : 0;
            const prev = years[prevIdx];
            const next = years[nextIdx];

            let rowsHtml = '';
            for (let r of rows) {
                rowsHtml += '<tr>';
                rowsHtml += `<td>${r.Make}</td>`;
                rowsHtml += `<td>${r.Model}</td>`;
                rowsHtml += `<td>${r.Vehicle_Type}</td>`;
                rowsHtml += `<td>${r.Region}</td>`;
                rowsHtml += `<td>${r.Range}</td>`;
                rowsHtml += '</tr>';
            }

            const template = await readTemplate('year.html');
            const response = template
                .replace('$$$YEAR$$$', year)
                .replace('$$$YEAR_ROWS$$$', rowsHtml)
                .replace('$$$NAV_YEARS$$$', years.map(y => `<a href="/years/${y}">${y}</a>`).join(' | '))
                .replace('$$$PREV_LINK$$$', `/years/${prev}`)
                .replace('$$$NEXT_LINK$$$', `/years/${next}`);

            res.type('html').status(200).send(response);
        } catch (ex) {
            console.error("year route template error:", ex.message);
            res.status(500).type('txt').send("Server Error");
        }
    });
});

// Route: vehicle detail by rowid
app.get('/vehicle/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'SELECT rowid, * FROM electric_vehicles WHERE rowid = ?;';
    db.get(sql, [id], async (err, row) => {
        if (err) {
            console.error("SQL ERROR:", err.message);
            return res.status(500).type('txt').send("SQL Error: " + err.message);
        }
        if (!row) {
            return res.status(404).type('txt').send(`Error: no vehicle with id ${id}`);
        }
        try {
            const template = await readTemplate('vehicle_detail.html');
            // fill in fields, including an image src if available
            const response = template
                .replace('$$$MAKE$$$', row.Make || '')
                .replace('$$$MODEL$$$', row.Model || '')
                .replace('$$$YEAR$$$', row.Year || '')
                .replace('$$$REGION$$$', row.Region || '')
                .replace('$$$TYPE$$$', row.Vehicle_Type || '')
                .replace('$$$RANGE$$$', row.Range || '')
                .replace('$$$BATTERY$$$', row.Battery_Capacity || '')
                .replace('$$$ENERGY$$$', row.Energy_Consumption || '')
                .replace('$$$CO2$$$', row.C02_Saved || '')
                .replace('$$$IMG_SRC$$$', `/images/vehicles/${encodeURIComponent(row.Make)}_${encodeURIComponent(row.Model)}.jpg`)
                .replace('$$$IMG_ALT$$$', `${row.Make} ${row.Model}`);
            res.type('html').status(200).send(response);
        } catch (ex) {
            console.error("vehicle detail template error:", ex.message);
            res.status(500).type('txt').send("Server Error");
        }
    });
});

// Generic 404 for unknown route (last middleware)
app.use((req, res) => {
    res.status(404).type('txt').send(`404: Route ${req.originalUrl} not found`);
});

app.listen(port, () => {
    console.log("Now listening on port " + port);
});