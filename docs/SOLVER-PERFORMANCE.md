# Solver selection and attachment searches

Author: CA

The Windows app selects its optimizer automatically for Calculate build, Best in category, scopes and magazines. Large attachment graphs can use OR-Tools CP-SAT. Smaller graphs retain HiGHS. The decision depends on the current configuration, including available parts and selected attachments, rather than a fixed list of weapon names.

The initial large-graph threshold is 2,000 attachment edges. CP-SAT also requires its bundled native runtime and at least eight logical processors. Full build searches use eight CP-SAT workers. Scope and magazine checks use one solver worker per candidate with a bounded pool of up to eight candidates. These settings are internal and do not require user configuration. Runtime or request failures retain a standard optimizer fallback.

Compatibility checks still include the complete assembly, nested adapters, blocked slots, selected scope and magazine, purchase availability and budget. Proven optimal, incomplete, infeasible and unchecked results retain distinct meanings. A timeout is not treated as proof of incompatibility.

Attachment searches prioritize candidates matching the current search and filter. Completed compatibility checks are saved locally and reused for the same database, engine and configuration. Closing a picker stops active work; reopening it resumes the remaining checks. A database or engine change invalidates stale entries. Performance depends on the weapon, settings, machine and local cache.

The native solvers and dependency notices are included in the portable package. No Python environment, compiler installation or automatic solver download is required to run the app. Data updates and program updates remain separate, manual actions.
