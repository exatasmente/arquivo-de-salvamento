"""What to make: name -> spec. `proc` is a builder in procedural.py. tris: about how many triangles it has. tex: texture size.
grime / rust: how much dirt and rust are painted in (0..1). tint: a colour multiplier. gain, contrast, sat: the painting.
detail: the name of its drawing in details.py, if not its own. floor: False for a thing that hangs (no dirt of the floor at its foot)."""
def P(proc, tris, tex=512, **kw): return {'proc': proc, 'tris': tris, 'tex': tex, **kw}
PROPS = {
    # these were a downloaded shape once; they are built in procedural.py now, to the same size and pivot
    'fogareiro': P('fogareiro', 500, 512, rust=0.7, grime=0.8),
    'gerador': P('gerador', 800, 1024, rust=0.25, grime=0.6),
    'quadro': P('quadro', 300, 512, rust=0.2, grime=0.6),
    'galao': P('galao', 240, 512, rust=0.4, grime=0.6),
    'carrinho': P('carrinho', 800, 1024, rust=0.35, grime=0.7),
    'pneu': P('pneu', 400, 512, grime=0.8),
    'cama_improvisada': P('cama_improvisada', 700, 1024, rust=0.3, grime=0.7),
    'caixa_ferramentas': P('caixa_ferramentas', 500, 512, rust=0.3, grime=0.6),
    # made in Blender
    'bomba': P('bomba', 1400, 1024, rust=0.0, grime=0.5),
    'bomba_quebrada': P('bomba', 1400, 1024, rust=1.0, grime=0.9, tint=(0.85, 0.7, 0.6)),
    'filtro_corpo': P('filtro', 1100, 512, rust=0.15, grime=0.6),
    'bateria_celula': P('bateria_celula', 200, 512, grime=0.4),
    'bateria_base': P('bateria_base', 250, 512, rust=0.3, grime=0.6),
    'bancada': P('bancada', 1600, 1024, grime=0.6),
    'mesa': P('mesa', 480, 512, grime=0.6),
    'banco': P('banco', 260, 512, grime=0.6),
    'colchao_base': P('colchao_base', 420, 512, grime=0.5),
    'colchao_manta': P('colchao_manta', 130, 512, grime=0.2, tint=(1, 1, 1)),
    'caixa_dagua': P('caixa_dagua', 800, 512, grime=0.7),
    'armario': P('armario', 450, 512, rust=0.35, grime=0.7),
    'balde': P('balde', 260, 512, rust=0.4, grime=0.6),
    'cozinha': P('cozinha', 1700, 1024, grime=0.7),
    'palete': P('palete', 500, 512, grime=0.7),
    'saco_cimento': P('saco_cimento', 80, 512, grime=0.6),
    'betoneira': P('betoneira', 900, 1024, rust=0.5, grime=0.8),
    'andaime': P('andaime', 1100, 512, rust=0.3, grime=0.6),
    'pilar_forma': P('pilar_forma', 620, 1024, grime=0.8),
    'forma_tabuas': P('forma_tabuas', 400, 512, grime=0.8),
    'tambor': P('tambor', 330, 512, rust=0.5, grime=0.7),
    'caixote': P('caixote', 300, 512, grime=0.7),
    'prateleira_modulo': P('prateleira_modulo', 260, 512, rust=0.2, grime=0.6),
    'lampada_gaiola': P('lampada_gaiola', 380, 512, grime=0.3, floor=False),
    'valvula': P('valvula', 450, 512, rust=0.3, grime=0.4, floor=False),
    'trilho': P('trilho', 900, 512, rust=0.8, grime=0.8),
    'div_chapa': P('div_chapa', 320, 512, rust=0.6, grime=0.8),
    'div_palete': P('div_palete', 380, 512, grime=0.8),
    'div_lona': P('div_lona', 240, 512, grime=0.8),
    'div_grade': P('div_grade', 260, 512, rust=0.5, grime=0.7),
    'cabo_bobina': P('cabo_bobina', 400, 512, grime=0.5),
    # the second pass: what the scenes built out of plain boxes and cylinders (the shelves' boxes and tins, the pipes of the walls, the shaft's
    # ladder; on the street the skip and what is in it, the canopy, the hoarding)
    'caixa_papelao': P('caixa_papelao', 44, 256, grime=0.3),
    'lata': P('lata', 60, 128, rust=0.3, grime=0.4),
    'cacamba': P('cacamba', 900, 1024, rust=0.75, grime=0.9, chip=-0.06),
    'cacamba_entulho': P('cacamba_entulho', 500, 512, rust=0.4, grime=0.8, floor=False, center=False, z0=0.0),
    'escada_poco': P('escada_poco', 500, 256, rust=0.9, grime=0.5, center=False),
    'cano': P('cano', 250, 512, rust=0.35, grime=0.6, floor=False, center=False, z0=0.0),
    'cano_flange': P('cano_flange', 120, 128, rust=0.35, grime=0.6, floor=False, center=False, z0=0.0),
    'cano_parede': P('cano_parede', 400, 1024, rust=0.4, grime=0.7, floor=False, center=False, z0=0.0),
    'cano_descida': P('cano_descida', 150, 256, rust=0.5, grime=0.8),
    'marquise_modulo': P('marquise_modulo', 250, 512, rust=0.5, grime=0.8, floor=False, center=False, z0=0.0),
    'marquise_coluna': P('marquise_coluna', 150, 256, rust=0.5, grime=0.8),
    'tapume_painel': P('tapume_painel', 250, 1024, grime=0.9, center=False, z0=0.0),
    'tapume_poste': P('tapume_poste', 44, 128, grime=0.9),
}

# the triangles each prop is expected to stay near (the shapes are built for the game as they are: this is a note, not a reduction)
PROPS['bomba_quebrada'].update(detail='bomba')
