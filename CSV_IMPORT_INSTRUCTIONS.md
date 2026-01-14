# CSV Import Instructions for Systems, Activities, and Deliverables

## Overview

You can import multiple Systems, Activities, or Deliverables at once using a CSV (Comma-Separated Values) file. This is useful for bulk importing items instead of adding them one by one.

## Prerequisites

1. **Select a Site**: You must select a site before importing. The imported items will be assigned to the selected site.
2. **Optional: Select Departments and Purchase Orders**: Before importing, you can check the boxes for departments and/or purchase orders. All imported items will be assigned to the selected departments/POs.

## CSV File Format

### File Type
- **File Extension**: `.csv`, `.xlsx`, or `.xls`
- **Encoding**: UTF-8 (recommended)
- **Delimiter**: Comma (`,`)

### Required Columns

#### For Systems:
| Column Name | Required | Description | Example |
|------------|----------|-------------|---------|
| `name` | **Yes** | The name of the system | `ERP System` |
| `description` | No | Optional description of the system | `Enterprise Resource Planning system` |

#### For Activities:
| Column Name | Required | Description | Example |
|------------|----------|-------------|---------|
| `name` | **Yes** | The name of the activity | `Code Review` |

#### For Deliverables:
| Column Name | Required | Description | Example |
|------------|----------|-------------|---------|
| `name` | **Yes** | The name of the deliverable | `User Manual` |

## CSV File Layout

### Example 1: Systems CSV (with descriptions)

```csv
name,description
ERP System,Enterprise Resource Planning system
CRM System,Customer Relationship Management system
HRIS System,Human Resources Information System
Accounting Software,Financial management and reporting system
```

### Example 2: Systems CSV (without descriptions)

```csv
name
ERP System
CRM System
HRIS System
Accounting Software
```

### Example 3: Activities CSV

```csv
name
Code Review
Testing
Documentation
Training
Client Meeting
```

### Example 4: Deliverables CSV

```csv
name
User Manual
Technical Documentation
Training Materials
API Documentation
```

## Step-by-Step Import Process

### Step 1: Navigate to the Management Page
1. Go to **Dashboard** → **Admin**
2. Click on one of:
   - **Manage Systems**
   - **Manage Activities**
   - **Manage Deliverables**

### Step 2: Select Site
1. In the **"Select Site"** dropdown, choose the site where you want to import items
2. This is **required** - you cannot import without selecting a site

### Step 3: (Optional) Select Departments and Purchase Orders
1. Click the **"Add [System/Activity/Deliverable]"** button to open the add form
2. Check the boxes for any **Departments** you want to assign to all imported items
3. Check the boxes for any **Purchase Orders** you want to assign to all imported items
4. Close the add form (you don't need to save anything)
5. The selected departments/POs will be remembered for the import

**Note**: If you don't select any departments or POs, the items will be imported without department/PO assignments. You can edit them later to add assignments.

### Step 4: Prepare Your CSV File
1. Create a CSV file using Excel, Google Sheets, or any text editor
2. **First row must be the header** with column names (`name`, and optionally `description` for systems)
3. Each subsequent row should contain one item
4. Save the file with a `.csv` extension (or `.xlsx`/`.xls` if using Excel)

### Step 5: Import the CSV File
1. Click the **"Import CSV"** button (green button with upload icon)
2. Select your CSV file from your computer
3. Wait for the import to complete
4. You should see a success message showing how many items were imported

### Step 6: Verify Import
1. Check the table to see your imported items
2. Verify that departments and POs are assigned correctly (if you selected them)
3. You can edit any item if corrections are needed

## Important Notes

### Column Name Matching
- Column names are **case-insensitive** and can have variations:
  - `name`, `Name`, `NAME` all work
  - `description`, `Description`, `desc`, `DESC` all work (for systems)
- The import looks for columns containing these keywords, so `Item Name` or `System Name` will also work

### Data Validation
- **Empty rows are skipped**: Rows with no name will be ignored
- **Duplicate names are allowed**: The system will import items even if they have the same name
- **Special characters**: Most special characters are supported, but avoid using commas within field values (use quotes if necessary)

### Department and Purchase Order Assignments
- **All imported items** will receive the same department/PO assignments
- If you need different assignments for different items:
  1. Import items without assignments
  2. Edit each item individually to assign specific departments/POs
  OR
  1. Import in batches - select different departments/POs for each batch

### Error Handling
- If the import fails, you'll see an error message explaining the issue
- Common errors:
  - **"Please select a site first"**: Make sure you've selected a site before importing
  - **"CSV file must have at least a header row and one data row"**: Your file needs a header row and at least one data row
  - **"No valid items found in CSV file"**: All rows were empty or invalid

## CSV File Examples

### Complete Example: Systems with Descriptions

**File**: `systems_import.csv`
```csv
name,description
ERP System,Enterprise Resource Planning system for managing business operations
CRM System,Customer Relationship Management platform
HRIS System,Human Resources Information System
Project Management Tool,Software for tracking projects and tasks
Documentation System,Platform for managing technical documentation
```

### Complete Example: Activities

**File**: `activities_import.csv`
```csv
name
Code Review
Unit Testing
Integration Testing
Documentation Writing
Client Presentation
Training Session
Bug Fixing
Feature Development
```

### Complete Example: Deliverables

**File**: `deliverables_import.csv`
```csv
name
User Manual
Technical Documentation
API Documentation
Training Materials
Installation Guide
Configuration Guide
Troubleshooting Guide
```

## Tips for Successful Imports

1. **Use Excel or Google Sheets**: These tools make it easy to create properly formatted CSV files
2. **Check for commas in data**: If your item names contain commas, wrap the entire field in quotes: `"System, Version 2.0"`
3. **Remove empty rows**: Delete any completely empty rows from your CSV file
4. **Test with a small file first**: Import 2-3 items first to verify the format works, then import the full list
5. **Save as UTF-8**: When saving from Excel, choose "CSV UTF-8" format to avoid encoding issues

## Troubleshooting

### Import button is grayed out or not working
- Make sure you've selected a site first
- Check that your browser allows file uploads

### Items imported but no departments/POs assigned
- Make sure you selected departments/POs before clicking "Import CSV"
- The selections are remembered from the add form, so open the add form, make selections, then close it before importing

### Some items didn't import
- Check that each row has a value in the `name` column
- Empty rows are automatically skipped
- Check the error message for specific details

### Special characters not displaying correctly
- Save your CSV file with UTF-8 encoding
- Avoid using special characters that might cause encoding issues

## Need Help?

If you encounter issues:
1. Check the error message displayed on the page
2. Verify your CSV file matches the format shown in the examples
3. Try importing a smaller test file first
4. Make sure you've selected a site before importing
