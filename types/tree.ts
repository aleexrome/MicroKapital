export interface BranchTreeData {
  id: string
  nombre: string
  counts: Record<string, number>  // tipo → count of ACTIVE loans
  ownOnly?: boolean                // true = coordinador mode, no branch nav
}
