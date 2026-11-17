import { TableCell, TableRow } from "@/components/ui/table";
import type { compareRowModel } from "../utils/compare";
/** total: 표 맨 위에 고정하는 전체 합계 줄 */
export function CompareRows({ rows, total = false }: { rows: ReturnType<typeof compareRowModel>[]; total?: boolean }) {
    return <>{rows.map(row => <TableRow key={row.key} className={total ? "bg-muted/50 font-semibold hover:bg-muted/50" : undefined}>
        <TableCell className={row.deleted ? "text-muted-foreground" : "font-medium"}>
            {total ? "전체 합계" : row.label}{!total && row.sublabel && <p className="text-xs text-muted-foreground">{row.sublabel}</p>}
        </TableCell>
        {row.cells.map(cell => <TableCell key={cell.key} className="text-right tabular-nums" title={cell.tooltip}>{cell.text}</TableCell>)}
    </TableRow>)}</>;
}
