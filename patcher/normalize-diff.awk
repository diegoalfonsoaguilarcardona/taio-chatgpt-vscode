# normalize-diff.awk — POSIX awk version (no gawk-only features)
# - Adds missing leading space to context lines inside hunks
# - Strips Markdown fences (``​`...) and "### FILE:" headings
# - Rewrites hunk headers with correct ,<len> values
# - Keeps "\ No newline at end of file" marker untouched

# Global hunk state
BEGIN {
  in_hunk = 0
  hunk_n = 0
  old_count = new_count = 0
  start_old = start_new = 0
}

function flush_hunk(    i, header) {
  if (!in_hunk) return
  header = "@@ -" start_old "," old_count " +" start_new "," new_count " @@"
  print header
  for (i = 1; i <= hunk_n; i++) print hunk[i]
  in_hunk = 0
  hunk_n = 0
  old_count = new_count = 0
}

# Parse a unified-diff hunk header line without using capture arrays.
# Sets globals: start_old, start_new
function parse_header(line,    s, c) {
  # Expect something like: @@ -123,7 +130,6 @@ optional text
  # Strip leading "@@ -"
  sub(/^@@ -/, "", line)

  # start_old = leading number
  if (match(line, /^[0-9]+/)) {
    start_old = int(substr(line, RSTART, RLENGTH))
    line = substr(line, RSTART + RLENGTH)
  } else {
    start_old = 0
  }

  # Skip optional ",<len_old>"
  sub(/^,[0-9]+/, "", line)

  # Skip the space and plus
  sub(/^ \+/, "", line)

  # start_new = next leading number
  if (match(line, /^[0-9]+/)) {
    start_new = int(substr(line, RSTART, RLENGTH))
    line = substr(line, RSTART + RLENGTH)
  } else {
    start_new = 0
  }

  # Ignore optional ",<len_new>" and trailing " @@"
}

function start_hunk_now() {
  in_hunk = 1
  hunk_n = 0
  old_count = new_count = 0
}

{
  sub(/\r$/, "", $0)              # drop CR if present (clipboard/Windows)

  # Strip code fences and generator headings
  if ($0 ~ /^``​`/) next
  if ($0 ~ /^### FILE:/) next

  # Detect hunk header (tolerate missing lengths)
  if ($0 ~ /^@@ -[0-9][0-9,]* \+[0-9][0-9,]* @@/) {
    flush_hunk()
    parse_header($0)
    start_hunk_now()
    next  # we will print rebuilt header in flush_hunk()
  }

  # File headers pass through verbatim
  if ($0 ~ /^(--- |\+\+\+ )/) {
    flush_hunk()
    print $0
    next
  }

  if (in_hunk) {
    if ($0 ~ /^\\ No newline at end of file$/) {
      hline = $0                                # special marker (no counts)
    } else if ($0 ~ /^[ +-]/) {
      hline = $0
      c = substr($0, 1, 1)
      if (c == " ") { old_count++; new_count++ }
      else if (c == "-") { old_count++ }
      else if (c == "+") { new_count++ }
    } else {
      # Missing prefix → treat as context
      hline = " " $0
      old_count++; new_count++
    }
    hunk[++hunk_n] = hline
    next
  }

  # Passthrough outside hunks
  print $0
}

END {
  flush_hunk()
}