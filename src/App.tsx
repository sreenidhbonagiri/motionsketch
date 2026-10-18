import { EditorShell } from './components/EditorShell'
import { WelcomeScreen } from './components/WelcomeScreen'
import { useEditorStore } from './state/store'

export default function App() {
  const workspace = useEditorStore((s) => s.workspace)
  if (workspace === 'welcome') {
    return <WelcomeScreen />
  }
  return <EditorShell />
}
