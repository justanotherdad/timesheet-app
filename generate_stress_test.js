const fs = require('fs');

// Stress test: generates CSVs for Admin import + bid sheet import
// Run: node generate_stress_test.js

// 1. Deliverables (for Admin → Manage Timesheet Options → Deliverables)
const deliverablesCsv = "name\nIQ Execution\nOQ Execution\n";
fs.writeFileSync('stress_test_deliverables.csv', deliverablesCsv);
console.log("✅ Created 'stress_test_deliverables.csv' (2 deliverables)");

// 2. Activities (for Admin → Manage Timesheet Options → Activities)
const activitiesCsv = "name\nP&ID Walkdown\nComponent Verification\nAlarm Testing\nSequence Functional Test\n";
fs.writeFileSync('stress_test_activities.csv', activitiesCsv);
console.log("✅ Created 'stress_test_activities.csv' (4 activities)");

// 3. Systems (for Admin → Manage Timesheet Options → Systems)
let systemsRows = "name,description\n";
for (let i = 1; i <= 500; i++) {
  const padId = i.toString().padStart(3, '0');
  systemsRows += `System Unit ${padId},Stress test system ${i}\n`;
}
fs.writeFileSync('stress_test_systems.csv', systemsRows);
console.log("✅ Created 'stress_test_systems.csv' (500 systems)");

// 4. Bid sheet import CSV (for Bid Sheet → Import CSV)
const bidHeaders = "System_Name,System_Number,Deliverable_Name,Activity_Name,Budgeted_Hours\n";
let bidRows = "";
for (let i = 1; i <= 500; i++) {
  const padId = i.toString().padStart(3, '0');
  bidRows += `System Unit ${padId},SYS-${padId},IQ Execution,P&ID Walkdown,10\n`;
  bidRows += `System Unit ${padId},SYS-${padId},IQ Execution,Component Verification,5\n`;
  bidRows += `System Unit ${padId},SYS-${padId},OQ Execution,Alarm Testing,15\n`;
  bidRows += `System Unit ${padId},SYS-${padId},OQ Execution,Sequence Functional Test,20\n`;
}
fs.writeFileSync('stress_test_500.csv', bidHeaders + bidRows);
console.log("✅ Created 'stress_test_500.csv' (500 systems × 4 rows = 2,000 task rows)");
console.log("");
console.log("Next: Import deliverables, activities, systems in Admin, then import stress_test_500.csv into a Bid Sheet.");
