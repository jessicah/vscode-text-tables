import * as tt from './ttTable';
import * as vscode from 'vscode';
import { tableSizeRe } from './utils';

const verticalSeparator = '|';
const horizontalSeparator = '-';
const headingSeparator = '=';
const intersection = '+';

type StringReducer = (previous: string, current: string, index: number) => string;

export class ReStructuredTextParser implements tt.Parser {
    parse(text: string): tt.Table | undefined {
        if (!text || text.length === 0) {
            return undefined;
        }

        const result = new tt.Table();
        const strings = text.split('\n').map(x => x.trim()).filter(x => x.startsWith(verticalSeparator));

        for (const s of strings) {
            if (this.isSeparatorRow(s)) {
                result.addRow(tt.RowType.Separator, []);
                continue;
            }

            const lastIndex = s.length - (s.endsWith(verticalSeparator) ? 1 : 0);
            const values = s
                .slice(1, lastIndex)
                .split(verticalSeparator)
                .map(x => x.trim());

            result.addRow(tt.RowType.Data, values);
        }

        return result;
    }

    isSeparatorRow(text: string): boolean {
        return text.length > 1 && (text[1] === horizontalSeparator || text[1] === headingSeparator);
    }
}

export class ReStructuredTextStringifier implements tt.Stringifier {
    stringify(table: tt.Table): string {
        const result = [];

        let doneHeader = false;

        let i = -1;
        while (++i < table.rows.length) {
            const rowData = table.getRow(i);

            if (doneHeader == false) {
                if (table.rows[i].type == tt.RowType.Separator)
                    continue;
                // output the header:
                // 1. a normal separator line
                // 2. the data line
                // 3. the heading separator line
                result.push(rowData.reduce(this.separatorReducer(table.cols), intersection));
                result.push(rowData.reduce(this.dataRowReducer(table.cols), verticalSeparator));
                result.push(rowData.reduce(this.headerReducer(table.cols), intersection));
                
                doneHeader = true;
                continue;
            }

            // We don't output the separator row, each data row will add it
            if (table.rows[i].type == tt.RowType.Separator)
                continue;
            
            result.push(rowData.reduce(this.dataRowReducer(table.cols), verticalSeparator));
            result.push(rowData.reduce(this.separatorReducer(table.cols), intersection));
        }

        return result.join('\n');
    }

    private dataRowReducer(cols: tt.ColDef[]): StringReducer {
        return (prev, cur, idx) => {
            const pad = ' '.repeat(cols[idx].width - cur.length + 1);
            return prev + ' ' + cur + pad + verticalSeparator;
        };
    }

    private headerReducer(cols: tt.ColDef[]): (p: string, c: string, i: number) => string {
        return (prev, _, idx) => {
            // Intersections for each cell are '+', except the last one, where it should be '|'
            const ending = (idx === cols.length - 1)
                ? verticalSeparator
                : intersection;

            return prev + headingSeparator.repeat(cols[idx].width + 2) + ending;
        };
    }

    private separatorReducer(cols: tt.ColDef[]): (p: string, c: string, i: number) => string {
        return (prev, _, idx) => {
            return prev + horizontalSeparator.repeat(cols[idx].width + 2) + intersection;
        };
    }
}

export class ReStructuredTextLocator implements tt.Locator {
    /**
     * Locate start and end of ReStructuredText table in text from line number.
     *
     * @param reader Reader that is able to read line by line
     * @param lineNr Current line number
     * @returns vscode.Range if table was located. undefined if it failed
     */
    locate(reader: tt.LineReader, lineNr: number): vscode.Range | undefined {

        // Checks that line starts with vertical bar
        const isTableLikeString = (ln: number) => {
            if (ln < 0 || ln >= reader.lineCount) {
                return false;
            }
            const line = reader.lineAt(ln);
            const firstCharIdx = line.firstNonWhitespaceCharacterIndex;
            const firstChar = line.text[firstCharIdx];
            return firstChar === '+' || firstChar === '|';
        };

        let start = lineNr;
        while (isTableLikeString(start)) {
            start--;
        }

        let end = lineNr;
        while (isTableLikeString(end)) {
            end++;
        }

        if (start === end) {
            return undefined;
        }

        const startPos = reader.lineAt(start + 1).range.start;
        const endPos = reader.lineAt(end - 1).range.end;

        return new vscode.Range(startPos, endPos);
    }
}
