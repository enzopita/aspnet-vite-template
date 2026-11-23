import { Trans } from "@lingui/react/macro";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProductListItem } from "@/lib/api/gen/types/ProductListItem";
import { formatCurrency, formatInteger } from "@/lib/format";

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, ProductListItem>();

const columns = columnHelper.columns([
  columnHelper.accessor("sku", {
    header: () => <Trans>SKU</Trans>,
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  columnHelper.accessor("name", {
    header: () => <Trans>Produto</Trans>,
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  columnHelper.accessor("price", {
    header: () => <Trans>Preço</Trans>,
    cell: (info) => <span className="tabular-nums">{formatCurrency(Number(info.getValue()))}</span>,
  }),
  columnHelper.accessor("stockQuantity", {
    header: () => <Trans>Estoque</Trans>,
    cell: (info) => {
      const quantity = Number(info.getValue());
      return <Badge variant={quantity === 0 ? "destructive" : "secondary"}>{formatInteger(quantity)}</Badge>;
    },
  }),
]);

interface ProductsTableProps {
  items: ProductListItem[];
}

export function ProductsTable({ items }: ProductsTableProps) {
  const table = useTable({
    features,
    columns,
    data: items,
  });

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                <Trans>Nenhum produto encontrado.</Trans>
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
