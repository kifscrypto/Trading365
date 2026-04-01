filepath = '/vercel/share/v0-project/lib/data/articles.ts'
outpath = '/vercel/share/v0-project/scripts/table_output.txt'

with open(filepath, 'r') as f:
    lines = f.readlines()

# Line 189 is index 188 (0-based)
line = lines[188]

results = []

# Search for BYDFi occurrences across the full line
idx = 0
occurrence = 0
while True:
    idx = line.find('BYDFi', idx)
    if idx == -1:
        break
    occurrence += 1
    results.append(f"\n=== BYDFi occurrence #{occurrence} at char {idx} ===")
    results.append(repr(line[max(0, idx-400):idx+600]))
    idx += 5

with open(outpath, 'w') as f:
    f.write('\n'.join(results))

print(f"Done. {occurrence} BYDFi occurrences found. Output written to {outpath}")
