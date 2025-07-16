import pandas as pd
import numpy as np
from google.cloud import storage
import os
from datetime import datetime, timedelta
import pyarrow as pa
import pyarrow.parquet as pq

def load_zone_data(zone_number):
    """Load data for a specific zone and convert to long format"""
    filename = f"zone{zone_number}_rain.txt"
    
    # Read the file
    df = pd.read_csv(filename, header=None)
    
    # First row contains GRIDCODE values (skip 'NA' in first column)
    gridcodes = df.iloc[0, 1:].values
    
    # Remaining rows contain date and rainfall data
    data_rows = df.iloc[1:, :]
    
    # Extract dates and rainfall values
    dates = data_rows.iloc[:, 0].values
    rainfall_data = data_rows.iloc[:, 1:].values
    
    # Create long format data
    long_data = []
    for i, date in enumerate(dates):
        for j, gridcode in enumerate(gridcodes):
            rainfall = rainfall_data[i, j]
            # Convert to float, handle any non-numeric values
            try:
                rainfall_val = float(rainfall)
            except (ValueError, TypeError):
                rainfall_val = 0.0
            
            long_data.append({
                'date': date,
                'gridcode': int(gridcode),
                'zone': zone_number,
                'rainfall_mm': rainfall_val
            })
    
    return pd.DataFrame(long_data)

def convert_date_format(date_str):
    """Convert date from YYYYDDD format to YYYY-MM-DD"""
    # Handle float values that might have decimal points
    date_str = str(date_str).split('.')[0]  # Remove decimal part if present
    
    # Ensure it's 7 digits (YYYYDDD format)
    if len(date_str) != 7:
        raise ValueError(f"Invalid date format: {date_str}")
    
    year = int(date_str[:4])
    day_of_year = int(date_str[4:])
    
    # Create date from year and day of year
    start_date = datetime(year, 1, 1)
    target_date = start_date + timedelta(days=day_of_year - 1)
    
    return target_date.strftime('%Y-%m-%d')

def create_tidy_rainfall_dataframe():
    """Create tidy rainfall DataFrame from all zone files"""
    print("Loading zone rainfall data...")
    
    all_data = []
    for zone in range(1, 7):  # zones 1-6
        print(f"Processing zone {zone}...")
        zone_data = load_zone_data(zone)
        all_data.append(zone_data)
    
    # Combine all zones
    combined_df = pd.concat(all_data, ignore_index=True)
    
    # Convert date format
    print("Converting date format...")
    combined_df['date'] = combined_df['date'].apply(convert_date_format)
    combined_df['date'] = pd.to_datetime(combined_df['date'])
    
    # Sort by date, zone, gridcode for better organization
    combined_df = combined_df.sort_values(['date', 'zone', 'gridcode']).reset_index(drop=True)
    
    return combined_df

def upload_to_gcs(df, bucket_name='geosfm', file_name='tidy_rainfall_data.parquet'):
    """Upload DataFrame to Google Cloud Storage as Parquet"""
    print(f"Uploading to GCS bucket: {bucket_name}")
    
    # Set up credentials
    os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = 'coiled-data-e4drr_202505.json'
    
    # Initialize client
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    
    # Convert DataFrame to Parquet bytes
    table = pa.Table.from_pandas(df)
    
    # Create blob and upload
    blob = bucket.blob(file_name)
    
    # Write parquet to bytes buffer
    import io
    buffer = io.BytesIO()
    pq.write_table(table, buffer)
    buffer.seek(0)
    
    # Upload to GCS
    blob.upload_from_file(buffer, content_type='application/octet-stream')
    
    print(f"Successfully uploaded {file_name} to gs://{bucket_name}/{file_name}")
    print(f"File size: {len(buffer.getvalue())} bytes")

def main():
    """Main function to create tidy rainfall data and upload to GCS"""
    try:
        # Create tidy DataFrame
        tidy_df = create_tidy_rainfall_dataframe()
        
        print(f"\nTidy DataFrame created:")
        print(f"Shape: {tidy_df.shape}")
        print(f"Columns: {list(tidy_df.columns)}")
        print(f"Date range: {tidy_df['date'].min()} to {tidy_df['date'].max()}")
        print(f"Zones: {sorted(tidy_df['zone'].unique())}")
        print(f"Total GRIDCODES: {len(tidy_df['gridcode'].unique())}")
        
        print("\nSample data:")
        print(tidy_df.head(10))
        
        # Save locally first
        local_file = 'tidy_rainfall_data.parquet'
        tidy_df.to_parquet(local_file, index=False)
        print(f"\nSaved locally as: {local_file}")
        
        # Upload to GCS
        upload_to_gcs(tidy_df)
        
        # Show summary statistics
        print("\nSummary statistics:")
        print(f"Total records: {len(tidy_df):,}")
        print(f"Non-zero rainfall records: {len(tidy_df[tidy_df['rainfall_mm'] > 0]):,}")
        print(f"Max rainfall: {tidy_df['rainfall_mm'].max():.2f} mm")
        print(f"Mean rainfall (non-zero): {tidy_df[tidy_df['rainfall_mm'] > 0]['rainfall_mm'].mean():.2f} mm")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()