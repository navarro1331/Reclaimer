param([string]$EffectPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase,UIAutomationProvider,UIAutomationTypes,System.Xaml
$references=@([System.Windows.FrameworkElement].Assembly.Location,[System.Windows.Media.DrawingContext].Assembly.Location,[System.Windows.Size].Assembly.Location,[System.Windows.Automation.Provider.IToggleProvider].Assembly.Location,[System.Windows.Automation.ToggleState].Assembly.Location,[System.Xaml.XamlReader].Assembly.Location)
Add-Type -ReferencedAssemblies $references -TypeDefinition @"
using System;using System.Windows;using System.Windows.Media;using System.Windows.Automation;using System.Windows.Automation.Peers;using System.Windows.Automation.Provider;
public class RealOwnedToggle:FrameworkElement {
 public bool IsOn;public Action Changed;
 protected override AutomationPeer OnCreateAutomationPeer(){return new RealOwnedTogglePeer(this);}
 protected override Size MeasureOverride(Size available){return new Size(160,30);}
 protected override void OnRender(DrawingContext context){context.DrawRectangle(IsOn?Brushes.Green:Brushes.Gray,null,new Rect(0,0,160,30));}
 public void Change(){IsOn=!IsOn;InvalidateVisual();if(Changed!=null)Changed();}
}
public class RealOwnedTogglePeer:FrameworkElementAutomationPeer,IToggleProvider {
 public RealOwnedTogglePeer(RealOwnedToggle owner):base(owner){}
 protected override string GetNameCore(){return "Owned custom toggle";}
 protected override AutomationControlType GetAutomationControlTypeCore(){return AutomationControlType.Custom;}
 public override object GetPattern(PatternInterface pattern){return pattern==PatternInterface.Toggle?this:base.GetPattern(pattern);}
 public ToggleState ToggleState{get{return ((RealOwnedToggle)Owner).IsOn?ToggleState.On:ToggleState.Off;}}
 public void Toggle(){var control=(RealOwnedToggle)Owner;control.Dispatcher.Invoke(new Action(control.Change));}
}
"@
$window=[System.Windows.Window]::new();$window.Title='Owned parity controls';$window.ShowInTaskbar=$false;$window.WindowStartupLocation='Manual';$window.Left=-2000;$window.Top=-2000;$window.Width=360;$window.Height=240
$panel=[System.Windows.Controls.StackPanel]::new();$custom=[RealOwnedToggle]::new();$label=[System.Windows.Controls.TextBlock]::new();$label.Text='State:False'
$custom.Changed=[Action]{ $label.Text='State:'+$custom.IsOn;[IO.File]::WriteAllText($EffectPath,$label.Text) }
$list=[System.Windows.Controls.ListBox]::new();$list.Height=80;[void]$list.Items.Add('Choice A');[void]$list.Items.Add('Choice B')
$selection=[System.Windows.Controls.TextBlock]::new();$selection.Text='Selection:none';$list.Add_SelectionChanged({$selection.Text='Selection:'+$list.SelectedItem;[IO.File]::WriteAllText($EffectPath,$selection.Text)})
[void]$panel.Children.Add($custom);[void]$panel.Children.Add($label);[void]$panel.Children.Add($list);[void]$panel.Children.Add($selection);$window.Content=$panel
$window.Add_Loaded({$helper=[System.Windows.Interop.WindowInteropHelper]::new($window);[Console]::WriteLine('OWNED_FIXTURE:'+$PID+':'+$helper.Handle.ToInt64())})
$app=[System.Windows.Application]::new();[void]$app.Run($window)