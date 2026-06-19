export type NodeType = 'Identifier' | 'CallExpression';

export interface IJSGlobalNode {
  start: number;
  end: number;
  type: NodeType;
  loc: {
    end: {
      line: number;
      column: number;
    };
    start: {
      line: number;
      column: number;
    };
  };
  callee?: IJSGlobalNode;
  parents: Array<IJSGlobalNode>;
}

export interface IJSGlobal {
  name: string;
  nodes: IJSGlobalNode[];
}

export interface IParseResult {
  ast: Record<string, unknown>;
  globals: IJSGlobal[];
  parsingError: string;
}

export type IParseWithGlobals = (code: string) => IParseResult;

declare const parseWithGlobals: IParseWithGlobals;

export default parseWithGlobals;
