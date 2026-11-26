// Enumerations.cs

export const LineMergeType = Object.freeze({ MoveNew: 'MoveNew', MoveExisting: 'MoveExisting' });

export const AnchorPoint = Object.freeze({
  TopLeft: 'TopLeft',
  TopCenter: 'TopCenter',
  TopRight: 'TopRight',
  MiddleLeft: 'MiddleLeft',
  Center: 'Center',
  MiddleRight: 'MiddleRight',
  BottomLeft: 'BottomLeft',
  BottomCenter: 'BottomCenter',
  BottomRight: 'BottomRight',
});

export const ShadowType = Object.freeze({
  Glow: 'Glow',
  Bevel: 'Bevel',
  HardShadow: 'HardShadow',
  SoftShadow: 'SoftShadow',
});

export const OffsetType = Object.freeze({ Regular: 'Regular', Subscript: 'Subscript', Superscript: 'Superscript' });

export const RubyPart = Object.freeze({
  None: 'None',
  Base: 'Base',
  Parenthesis: 'Parenthesis',
  TextBefore: 'TextBefore',
  TextAfter: 'TextAfter',
});

export const HorizontalTextDirection = Object.freeze({ LeftToRight: 'LeftToRight', RightToLeft: 'RightToLeft' });

export const VerticalTextType = Object.freeze({ None: 'None', Positioned: 'Positioned', Rotated: 'Rotated' });
