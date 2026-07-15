import * as React from "react";
import { cn } from "./utils";

export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) => (
  <div className="w-full overflow-auto"><table ref={ref} className={cn("w-full border-collapse text-sm", className)} {...props} /></div>
));
Table.displayName = "Table";
export const TableHeader = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...props} />;
export const TableBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...props} />;
export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => <tr ref={ref} className={cn("border-b border-[#dce2e1]", className)} {...props} />);
TableRow.displayName = "TableRow";
export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => <th ref={ref} className={cn("h-10 px-3 text-left align-middle text-[11px] font-bold uppercase text-[#65706f]", className)} {...props} />);
TableHead.displayName = "TableHead";
export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => <td ref={ref} className={cn("px-3 py-2.5 align-middle", className)} {...props} />);
TableCell.displayName = "TableCell";

