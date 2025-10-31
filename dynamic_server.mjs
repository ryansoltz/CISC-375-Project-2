import * as fs from 'node:fs';
import * as path from 'node:path';
import { default as express } from "express";
import { default as sqlite3 } from "sqlite3";

let port = 8080;
let public_dir = './public';
let template_dir = './templates';

let app = express();
app.use(express.static(public_dir));

const db = new sqlite3.Database('./electric_vehicles.db', sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log("Successfully connected to database");
    }
});

let nav_list;

//
// HOME PAGE – list distinct vehicle types
//
app.get('/', (req, res) => {
    let sql = 'SELECT DISTINCT Vehicle_Type FROM electric_vehicles ORDER BY Vehicle_Type ASC;';
    console.log('Running query:', sql);

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("SQL ERROR:", err.message);
            res.status(500).type('txt').send("SQL Error: " + err.message);
        } else {
            fs.readFile(path.join(template_dir, 'index.html'), { encoding: 'utf8' }, (err, data) => {
                if (err) {
                    console.error("Template Read Error:", err.message);
                    res.status(500).type('txt').send("Template Read Error");
                } else {
                    let type_list = '';
                    for (let i = 0; i < rows.length; i++) {
                        type_list += '<li><a href="/vehicles/' + encodeURIComponent(rows[i].Vehicle_Type) + '">';
                        type_list += rows[i].Vehicle_Type + '</a></li>';
                    }
                    let response = data.replace('$$$TYPE_LIST$$$', type_list);
                    res.status(200).type('html').send(response);
                }
            });
        }
    });
});

//
// VEHICLES BY TYPE
//
app.get('/vehicles/:vehicle_type', (req, res) => {
    let sql = 'SELECT * FROM electric_vehicles WHERE Vehicle_Type = ?;';
    console.log('Running query:', sql, 'with value:', req.params.vehicle_type);

    db.all(sql, [req.params.vehicle_type], (err, rows) => {
        if (err) {
            console.error("SQL ERROR:", err.message);
            res.status(500).type('txt').send("SQL Error: " + err.message);
        } else if (!rows || rows.length === 0) {
            res.status(404).type('txt').send(`Error: no data for vehicle type "${req.params.vehicle_type}"`);
        } else {
            fs.readFile(path.join(template_dir, 'vehicles.html'), { encoding: 'utf8' }, (err, data) => {
                if (err) {
                    console.error("Template Read Error:", err.message);
                    res.status(500).type('txt').send("Template Read Error");
                } else {
                    let vehicle_rows = '';
                    for (let i = 0; i < rows.length; i++) {
                        vehicle_rows += '<tr>';
                        vehicle_rows += '<td>' + rows[i].Make + '</td>';
                        vehicle_rows += '<td>' + rows[i].Model + '</td>';
                        vehicle_rows += '<td>' + rows[i].Year + '</td>';
                        vehicle_rows += '<td>' + rows[i].Region + '</td>';
                        vehicle_rows += '<td>' + rows[i].Range + '</td>';
                        vehicle_rows += '<td>' + rows[i].Battery_Capacity + '</td>';
                        vehicle_rows += '<td>' + rows[i].Energy_Consumption + '</td>';
                        vehicle_rows += '<td>' + rows[i].C02_Saved + '</td>';
                        vehicle_rows += '</tr>';
                    }

                    let response = data
                        .replace('$$$NAV$$$', nav_list)
                        .replace('$$$VEHICLE_TYPE$$$', req.params.vehicle_type)
                        .replace('$$$VEHICLE_ROWS$$$', vehicle_rows);
                    res.status(200).type('html').send(response);
                }
            });
        }
    });
});

//
// === NEW: REGIONS PAGE ===
//
app.get('/regions', (req, res) => {
    const sql = 'SELECT DISTINCT Region AS val FROM electric_vehicles ORDER BY Region ASC;';
    db.all(sql, [], (err, rows) => {
        const fallback = ['North America', 'Europe', 'Asia', 'Australia'];
        const regions = (rows && rows.length) ? rows.map(r => r.val) : fallback;

        fs.readFile(path.join(template_dir, 'regions.html'), 'utf8', (rErr, data) => {
            if (rErr) {
                console.error("Template read error:", rErr.message);
                return res.status(500).type('txt').send("Server Error");
            }
            const region_list = regions
                .map(r => `<li><a href="/regions/${encodeURIComponent(r)}">${r}</a></li>`)
                .join('\n');
            nav_list = region_list;
            res.status(200).type('html').send(data.replace('$$$REGION_LIST$$$', region_list));
        });
    });
});



//
// === NEW: VEHICLES BY REGION ===
//
app.get('/regions/:region', (req, res) => {
    const sql = 'SELECT * FROM electric_vehicles WHERE Region = ?;';
    console.log('Running query:', sql, 'with value:', req.params.region);

    db.all(sql, [req.params.region], (err, rows) => {
        if (err) {
            console.error("SQL ERROR:", err.message);
            res.status(500).type('txt').send("SQL Error: " + err.message);
        } else if (!rows || rows.length === 0) {
            res.status(404).type('txt').send(`Error: no data for region "${req.params.region}"`);
        } else {
            fs.readFile(path.join(template_dir, 'region.html'), { encoding: 'utf8' }, (err, data) => {
                if (err) {
                    console.error("Template Read Error:", err.message);
                    res.status(500).type('txt').send("Template Read Error");
                } else {
                    let vehicle_rows = '';
                    for (let i = 0; i < rows.length; i++) {
                        vehicle_rows += '<tr>';
                        vehicle_rows += '<td>' + rows[i].Make + '</td>';
                        vehicle_rows += '<td>' + rows[i].Model + '</td>';
                        vehicle_rows += '<td>' + rows[i].Year + '</td>';
                        vehicle_rows += '<td>' + rows[i].Vehicle_Type + '</td>';
                        vehicle_rows += '<td>' + rows[i].Range + '</td>';
                        vehicle_rows += '<td>' + rows[i].Battery_Capacity + '</td>';
                        vehicle_rows += '<td>' + rows[i].Energy_Consumption + '</td>';
                        vehicle_rows += '<td>' + rows[i].C02_Saved + '</td>';
                        vehicle_rows += '</tr>';
                    }

                    let response = data
                        .replace('$$$NAV$$$', nav_list)
                        .replace('$$$REGION$$$', req.params.region)
                        .replace('$$$REGION_ROWS$$$', vehicle_rows);
                    res.status(200).type('html').send(response);
                }
            });
        }
    });
});


//
// === NEW: TYPES PAGE (still works) ===
app.get('/types', (req, res) => {
    const sql = 'SELECT DISTINCT Vehicle_Type AS val FROM electric_vehicles ORDER BY Vehicle_Type ASC;';
    db.all(sql, [], (err, rows) => {
        const fallback = ['Hatchback', 'SUV', 'Sedan', 'Truck'];
        const types = (rows && rows.length) ? rows.map(r => r.val) : fallback;

        fs.readFile(path.join(template_dir, 'types.html'), 'utf8', (rErr, data) => {
            if (rErr) {
                console.error("Template read error:", rErr.message);
                return res.status(500).type('txt').send("Server Error");
            }
            const type_list = types.map(t => `<li><a href="/vehicles/${encodeURIComponent(t)}">${t}</a></li>`).join('\n');
            nav_list = type_list;
            return res.status(200).type('html').send(data.replace('$$$TYPE_LIST$$$', type_list));
        });
    });
});




// Years Page
app.get('/years', (req, res) => {
    const sql = 'SELECT DISTINCT Year AS val FROM electric_vehicles ORDER BY Year ASC;';
    db.all(sql, [], (err, rows) => {
        const fallback = ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];
        const types = (rows && rows.length) ? rows.map(r => r.val) : fallback;

        fs.readFile(path.join(template_dir, 'years.html'), 'utf8', (rErr, data) => {
            if (rErr) {
                console.error("Template read error:", rErr.message);
                return res.status(500).type('txt').send("Server Error");
            }
            const year_list = types.map(t => `<li><a href="/years/${encodeURIComponent(t)}">${t}</a></li>`).join('\n');
            nav_list = year_list;
            return res.status(200).type('html').send(data.replace('$$$YEAR_LIST$$$', year_list));
        });
    });
});

// Vehicles by Year
app.get('/years/:year', (req, res) => {
    const sql = 'SELECT * FROM electric_vehicles WHERE Year = ?;';
    console.log('Running query:', sql, 'with value:', req.params.year);

    db.all(sql, [req.params.year], (err, rows) => {
        if (err) {
            console.error("SQL ERROR:", err.message);
            res.status(500).type('txt').send("SQL Error: " + err.message);
        } else if (!rows || rows.length === 0) {
            res.status(404).type('txt').send(`Error: no data for year "${req.params.year}"`);
        } else {
            fs.readFile(path.join(template_dir, 'year.html'), { encoding: 'utf8' }, (err, data) => {
                if (err) {
                    console.error("Template Read Error:", err.message);
                    res.status(500).type('txt').send("Template Read Error");
                } else {
                    let vehicle_rows = '';
                    for (let i = 0; i < rows.length; i++) {
                        vehicle_rows += '<tr>';
                        vehicle_rows += '<td>' + rows[i].Make + '</td>';
                        vehicle_rows += '<td>' + rows[i].Model + '</td>';
                        vehicle_rows += '<td>' + rows[i].Region + '</td>';
                        vehicle_rows += '<td>' + rows[i].Vehicle_Type + '</td>';
                        vehicle_rows += '<td>' + rows[i].Range + '</td>';
                        vehicle_rows += '<td>' + rows[i].Battery_Capacity + '</td>';
                        vehicle_rows += '<td>' + rows[i].Energy_Consumption + '</td>';
                        vehicle_rows += '<td>' + rows[i].C02_Saved + '</td>';
                        vehicle_rows += '</tr>';
                    }

                    let response = data
                        .replace('$$$NAV$$$', nav_list)
                        .replace('$$$YEAR$$$', req.params.year)
                        .replace('$$$YEAR_ROWS$$$', vehicle_rows);
                    res.status(200).type('html').send(response);
                }
            });
        }
    });
});

//
// Default 404 handler
//
app.use((req, res) => {
    res.status(404).type('txt').send(`404 Not Found: ${req.originalUrl}`);
});

app.listen(port, () => {
    console.log("Now listening on port " + port);
});