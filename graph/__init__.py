"""SpendSentry deterministic engine package.

The LLM only extracts and converses; all judgment — amounts, dates,
thresholds, verdicts — is pure Python here. Same input => same verdict.

Submodules:
- rules:             POLICY, Violation, R-01~R-12 check_* fns, evaluate_report,
                     approval_route, quote_requirement, STANDARD_QUESTIONS,
                     match_standard_question, rule_tag.
- receipt:           _prepare_image, ReceiptExtract, classify_payment,
                     cross_check, check_overtime_taxi_receipt,
                     extract_receipt_image, evaluate_receipt.
- spendsentry_graph: classify, run, build_graph.

Import submodules explicitly, e.g. ``from graph.rules import evaluate_report``.
"""

__all__ = ["rules", "receipt", "spendsentry_graph"]
