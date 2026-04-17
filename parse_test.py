import re

with open('data/latest_text.txt') as f:
    text = f.read()

questions = []
blocks = re.split(r'(?:^|\n)\s*(?=[Qq]?\d+[\.\:\)]\s)', text)
for block in blocks:
    block = block.strip()
    if not block:
        continue
    
    q_text_match = re.match(r'^[Qq]?\d+[\.\:\)]\s*(.*?)(?=\s+[A-D][\.\:\)]|\s+[Aa]nswer|\Z)', block, re.DOTALL)
    if not q_text_match:
        print("Failed q_text match on:", repr(block[:20]))
        continue
    q_text = re.sub(r'\s+', ' ', q_text_match.group(1).strip())

    opts = {}
    for opt_char in ['A', 'B', 'C', 'D']:
        next_opts = ''.join([c for c in ['A','B','C','D'] if c > opt_char])
        if next_opts:
            lookahead = f"(?:\\s+[{next_opts}][\\.\\:\\)]|\\s+[Aa]nswer|\\Z)"
        else:
            lookahead = r"(?:\s+[Aa]nswer|\Z)"
        
        pattern = f"{opt_char}[\\.\\:\\)]\\s*(.*?){lookahead}"
        m = re.search(pattern, block, re.DOTALL | re.IGNORECASE)
        if m:
            opts[opt_char] = re.sub(r'\s+', ' ', m.group(1).strip())
        else:
            print("Failed option match for", opt_char, "on", block[:20])
            opts[opt_char] = ''
    
    answer_match = re.search(r'[Aa]nswer[^A-D]*(?P<ans>[A-D])', block)
    answer = answer_match.group('ans').upper() if answer_match else ''
    if not answer:
        print("Failed answer match on:", repr(block[:20]))

    if len([v for v in opts.values() if v]) < 2 or not answer:
        print("Skipped block:", repr(block[:20]))
        continue

    questions.append({'q': q_text, 'opts': opts, 'a': answer})

print(f"Extracted {len(questions)} questions")
