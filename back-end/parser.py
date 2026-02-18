"""Contract parsing: PDF text extraction, clause splitting, and clause type classification."""

import re
import pdfplumber


CLAUSE_TYPE_KEYWORDS = [
    ("Indemnity", ["indemnif", "indemnity", "hold harmless", "defend and indemnify"]),
    ("Limitation of Liability", ["limitation of liability", "limit of liability", "liability cap", "maximum liability", "cap on damages"]),
    ("Liability Exclusion", ["exclusion of liability", "exclude liability", "not liable", "no liability", "disclaim"]),
    ("Termination", ["termination", "terminate", "terminates", "early termination", "term of this agreement"]),
    ("Confidentiality", ["confidential", "confidentiality", "non-disclosure", "proprietary information"]),
    ("Governing Law", ["governing law", "choice of law", "laws of the", "jurisdiction"]),
    ("Dispute Resolution", ["arbitration", "arbitrate", "dispute resolution", "mediation", "litigation"]),
    ("Warranty", ["warranty", "warrant", "warranties", "as is", "as-is"]),
    ("Insurance", ["insurance", "insure", "insured", "coverage", "policy"]),
    ("Payment", ["payment", "payable", "invoice", "fee", "consideration"]),
    ("Intellectual Property", ["intellectual property", "ip rights", "patent", "copyright", "trademark", "license"]),
    ("Non-Compete", ["non-compete", "non compete", "non-solicit", "non solicit"]),
    ("Force Majeure", ["force majeure", "act of god", "beyond reasonable control"]),
]


class ContractParser:
    """Extract text from PDFs and split into classified clauses."""

    @staticmethod
    def extract_text_from_pdf(file_path: str) -> str:
        text = ""
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text += page.extract_text() + "\n"
        return text

    @staticmethod
    def _is_clause_boundary(line: str) -> bool:
        """Check if a line likely starts a new clause."""
        stripped = line.strip()
        if not stripped or len(stripped) < 3:
            return False
        
        # Check for numbered patterns
        if re.match(r'^\(?\d+[.)]\s+', stripped):
            return True
        if re.match(r'^\d+\.\d+(?:\.\d+)*[.)]\s+', stripped):
            return True
        if re.match(r'^\(?[a-z][.)]\s+', stripped):
            return True
        
        # Check for article/section patterns
        if re.match(r'^(Article|ARTICLE|Section|SECTION|Clause|CLAUSE)\s+', stripped, re.IGNORECASE):
            return True
        
        # Check for all-caps headings (likely clause titles)
        if stripped.isupper() and len(stripped) > 10 and len(stripped) < 100:
            return True
        
        # Check for title case headings
        if re.match(r'^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+[:.]?\s*$', stripped):
            return True
        
        return False

    @staticmethod
    def split_into_clauses(text: str) -> list[str]:
        """
        Split contract text into clauses using multiple strategies:
        1. Numbered items (1., 2., 1.1, etc.)
        2. Article/Section headings
        3. Roman numerals (Article I, Article II, etc.)
        4. Lettered items (a., b., (a), (b), etc.)
        5. Clause headings (all caps or title case)
        6. Paragraph breaks with context
        """
        # Strategy 1: Comprehensive numbering patterns
        # Matches: 1., 2., (1), (2), 1.1, 1.1.1, Article 1, Section 1, Article I, etc.
        numbered_pattern = (
            r"(?m)^(?="
            r"(?:\(?\d+[.)]\s+)"  # 1., 2., (1), (2)
            r"|(?:\d+\.\d+(?:\.\d+)*[.)]\s+)"  # 1.1, 1.2.3, etc.
            r"|(?:\(?[a-z][.)]\s+)"  # a., b., (a), (b)
            r"|(?:\(?[A-Z][.)]\s+)"  # A., B., (A), (B)
            r"|(?:Article\s+(?:\d+|I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XV|XX|XXX|XL|L|LX|LXX|LXXX|XC))\s*[:.]?\s*"  # Article 1, Article I, Article II, etc.
            r"|(?:ARTICLE\s+(?:\d+|I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XV|XX|XXX|XL|L|LX|LXX|LXXX|XC))\s*[:.]?\s*"  # ARTICLE I, etc.
            r"|(?:Section\s+\d+)\s*[:.]?\s*"  # Section 1, Section 2
            r"|(?:SECTION\s+\d+)\s*[:.]?\s*"  # SECTION 1
            r"|(?:Clause\s+\d+)\s*[:.]?\s*"  # Clause 1
            r"|(?:CLAUSE\s+\d+)\s*[:.]?\s*"  # CLAUSE 1
            r")"
        )
        
        parts = re.split(numbered_pattern, text)
        raw_clauses = [p.strip() for p in parts if p.strip() and len(p.strip()) > 10]
        
        # Strategy 2: If we got good results, process and clean them
        if len(raw_clauses) > 1:
            cleaned_clauses = []
            for i, clause in enumerate(raw_clauses):
                clause_start = clause[:50].strip()  # Look at first 50 chars for pattern detection
                
                # Check if this is a subsection (starts with decimal like 1.1, 1.2, etc.)
                subsection_match = re.match(r'^(\d+)\.(\d+)', clause_start)
                is_subsection = bool(subsection_match)
                
                # Check if this is a lettered sub-item (a., b., etc.) - likely a subsection
                is_lettered_sub = bool(re.match(r'^\(?[a-z][.)]\s+', clause_start))
                
                if (is_subsection or is_lettered_sub) and cleaned_clauses:
                    # Try to merge with parent clause
                    prev_clause = cleaned_clauses[-1]
                    prev_start = prev_clause[:50].strip()
                    
                    # Check if previous clause is a parent (e.g., "1." is parent of "1.1")
                    if is_subsection:
                        parent_num = subsection_match.group(1)
                        if re.match(rf'^{re.escape(parent_num)}[.)]\s+', prev_start):
                            # Merge subsection with parent clause
                            cleaned_clauses[-1] = prev_clause + "\n\n" + clause
                        else:
                            # Not a direct parent, but still might be related - check if it's a continuation
                            cleaned_clauses.append(clause)
                    elif is_lettered_sub:
                        # Lettered items are usually subsections - merge with previous if it's a numbered clause
                        if re.match(r'^\d+[.)]\s+', prev_start) or re.match(r'^\d+\.\d+', prev_start):
                            cleaned_clauses[-1] = prev_clause + "\n\n" + clause
                        else:
                            cleaned_clauses.append(clause)
                    else:
                        cleaned_clauses.append(clause)
                elif len(clause) < 50 and cleaned_clauses:
                    # Merge very short fragments with previous clause (likely headers or formatting artifacts)
                    cleaned_clauses[-1] += " " + clause
                else:
                    cleaned_clauses.append(clause)
            
            # Final cleanup: ensure minimum clause length and remove duplicates
            final_clauses = []
            seen = set()
            for clause in cleaned_clauses:
                clause_clean = clause.strip()
                if len(clause_clean) > 20:  # Minimum meaningful clause length
                    # Simple deduplication: check if very similar to previous
                    clause_hash = clause_clean[:100]  # Use first 100 chars as fingerprint
                    if clause_hash not in seen:
                        seen.add(clause_hash)
                        final_clauses.append(clause_clean)
            
            if len(final_clauses) > 0:
                return final_clauses
        
        # Strategy 3: Look for clause headings (all caps or title case on their own line)
        heading_pattern = r"(?m)^([A-Z][A-Z\s]{10,}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[:.]?\s*$"
        parts = re.split(heading_pattern, text)
        clauses = [p.strip() for p in parts if p.strip() and len(p.strip()) > 10]
        
        if len(clauses) > 1:
            return clauses
        
        # Strategy 4: Split by double line breaks (paragraphs) with smart merging
        paragraphs = re.split(r"\n\s*\n+", text)
        paragraph_clauses = [p.strip() for p in paragraphs if p.strip() and len(p.strip()) > 20]
        
        if len(paragraph_clauses) > 1:
            # Merge paragraphs that are likely continuations (don't start with clause markers)
            merged = []
            for para in paragraph_clauses:
                # Check if this paragraph starts a new clause
                first_line = para.split('\n')[0].strip()
                if ContractParser._is_clause_boundary(first_line) and merged:
                    # New clause
                    merged.append(para)
                elif merged:
                    # Likely continuation of previous clause
                    merged[-1] += "\n\n" + para
                else:
                    # First clause
                    merged.append(para)
            
            if len(merged) > 1:
                return merged
        
        # Strategy 5: Split by single line breaks if text has clear structure
        lines = text.split('\n')
        if len(lines) > 5:
            # Look for lines that start with capital letters and might be clause starts
            clause_starts = []
            for i, line in enumerate(lines):
                stripped = line.strip()
                if stripped and len(stripped) > 15:
                    # Check if line looks like a clause start (starts with capital, ends with period or colon)
                    if (stripped[0].isupper() and 
                        (stripped.endswith('.') or stripped.endswith(':') or 
                         re.match(r'^\d+[.)]', stripped) or
                         re.match(r'^[A-Z][a-z]+', stripped))):
                        clause_starts.append(i)
            
            if len(clause_starts) > 1:
                clauses = []
                for i in range(len(clause_starts)):
                    start = clause_starts[i]
                    end = clause_starts[i + 1] if i + 1 < len(clause_starts) else len(lines)
                    clause_text = '\n'.join(lines[start:end]).strip()
                    if len(clause_text) > 20:
                        clauses.append(clause_text)
                if clauses:
                    return clauses
        
        # Fallback: Return entire text as single clause
        return [text.strip()] if text.strip() else []

    @staticmethod
    def classify_clause_type(clause_text: str) -> str:
        """Return clause type from keyword matching, or 'General'."""
        lower = clause_text.lower()
        for clause_type, keywords in CLAUSE_TYPE_KEYWORDS:
            if any(kw.lower() in lower for kw in keywords):
                return clause_type
        return "General"
