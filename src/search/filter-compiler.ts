/**
 * Unified filter compiler for search operations.
 * Provides consistent filter semantics across filter-only, FTS, and vector search modes.
 */

import type { SearchOptions } from "./index";

export interface FilterClause {
  /** SQL WHERE conditions (without WHERE keyword) */
  conditions: string[];
  /** Parameters for prepared statement (in same order as conditions) */
  params: (string | number)[];
  /** Whether to join conditions with OR (true) or AND (false) */
  useOr: boolean;
}

/**
 * Convert filter pattern to LIKE pattern (wraps with % for partial matching).
 */
function fromFilterPattern(pattern: string): string {
  return `%${pattern.toLowerCase()}%`;
}

/**
 * Build filter clause from search options.
 * Handles fromAddress, toAddress, subject, afterDate, beforeDate filters consistently.
 * 
 * @param opts Search options
 * @param includeQueryCondition If true, includes the query condition (e.g., FTS MATCH) as first condition
 * @param queryParam Optional query parameter value (for FTS MATCH)
 * @returns Filter clause with conditions, params, and join operator
 */
export function buildFilterClause(
  opts: SearchOptions,
  includeQueryCondition: boolean = false,
  queryParam?: string
): FilterClause {
  const {
    fromAddress,
    toAddress,
    subject,
    afterDate,
    beforeDate,
    filterOr = false,
  } = opts;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // Add query condition first if requested (for FTS search)
  if (includeQueryCondition && queryParam !== undefined) {
    conditions.push(queryParam);
  }

  // Build filter conditions
  if (fromAddress) {
    const pattern = fromFilterPattern(fromAddress);
    const cond = "(m.from_address LIKE ? OR m.from_name LIKE ?)";
    conditions.push(filterOr ? `(${cond})` : cond);
    params.push(pattern, pattern);
  }

  if (toAddress) {
    const pattern = fromFilterPattern(toAddress);
    const cond =
      "(EXISTS (SELECT 1 FROM json_each(m.to_addresses) j WHERE j.value LIKE ?) OR EXISTS (SELECT 1 FROM json_each(m.cc_addresses) j WHERE j.value LIKE ?))";
    conditions.push(filterOr ? `(${cond})` : cond);
    params.push(pattern, pattern);
  }

  if (subject) {
    const pattern = fromFilterPattern(subject);
    const cond = "m.subject LIKE ?";
    conditions.push(filterOr ? `(${cond})` : cond);
    params.push(pattern);
  }

  if (afterDate) {
    const cond = "m.date >= ?";
    conditions.push(filterOr ? `(${cond})` : cond);
    params.push(afterDate);
  }

  if (beforeDate) {
    const cond = "m.date <= ?";
    conditions.push(filterOr ? `(${cond})` : cond);
    params.push(beforeDate);
  }

  return {
    conditions,
    params,
    useOr: filterOr,
  };
}

/**
 * Build WHERE clause string from filter clause.
 * 
 * @param clause Filter clause
 * @returns WHERE clause string (without WHERE keyword) or empty string if no conditions
 */
export function buildWhereClause(clause: FilterClause): string {
  if (clause.conditions.length === 0) {
    return "";
  }

  const joinOp = clause.useOr ? " OR " : " AND ";
  return clause.conditions.join(joinOp);
}
