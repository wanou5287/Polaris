import json
import os
from pathlib import Path

import pandas as pd


def get_file_size(file_path):
    """Get file size (units: KB, MB, GB)"""
    size_bytes = os.path.getsize(file_path)

    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.2f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.2f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def analyze_file(file_path):
    """Analyze a single file and return information"""
    try:
        # Try different separators in order: ^ -> , -> \t
        separators = ['^', ',', '\t']
        df = None

        separator = ''
        for sep in separators:
            try:
                df = pd.read_csv(file_path, sep=sep)
                # Check if parsing succeeded (at least one column)
                if len(df.columns) > 1:
                    separator = sep
                    break
            except:
                continue

        # If all separators failed
        if df is None or len(df.columns) <= 1:
            return None

        # Get column information (including non-null value statistics)
        col_info = []
        for col in df.columns:
            dtype = str(df[col].dtype)
            non_null_count = int(df[col].notna().sum())
            null_count = int(df[col].isna().sum())
            col_info.append({
                'column_name': col,
                'data_type': dtype,
                'non_null_count': non_null_count,
                'null_count': null_count
            })

        file_info = {
            'file_name': os.path.basename(file_path),
            'file_path': file_path.replace('\\', '/'),
            'file_separator': separator,
            'file_size': get_file_size(file_path),
            'row_count': int(len(df)),
            'column_count': int(len(df.columns)),
            'column_info': col_info
        }

        return file_info

    except Exception as e:
        return None


def scan_directory(directory_path):
    """Scan all CSV files in the directory and return an array of file information"""
    # Store all file information
    all_files_info = []

    # Traverse directory
    path = Path(directory_path)

    if not path.exists():
        print(f"Error: Directory '{directory_path}' does not exist!")
        return []

    # Find all CSV files in the current directory (non-recursive)
    files = list(path.glob('*.csv'))

    for file in files:
        file_info = analyze_file(str(file))

        # If reading failed, skip this file
        if file_info is not None:
            all_files_info.append(file_info)

    return json.dumps(all_files_info, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    # Usage example
    directory = input("Please enter the directory path to scan: ").strip()

    # If input is empty, use current directory
    if not directory:
        directory = "."

    print(f"\nStarting to scan directory: {os.path.abspath(directory)}\n")

    # Scan directory to get file information
    files_info = scan_directory(directory)

    # Print the array directly
    print(files_info)