from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
js=(ROOT/'js/v8-ai-assistant.js').read_text(encoding='utf-8')
assert "const VERSION='8.3.0'" in js
assert 'directorOperationalResponseV830' in js
assert 'data-ai-mode-v830="operate"' in js
assert 'Núcleo operativo verificable' in js
assert len([p for p in ROOT.rglob('*') if p.is_file()]) <= 100
print('V8.3.0 OK')
