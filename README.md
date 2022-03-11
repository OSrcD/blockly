渲染前端代码图形块
block.js
xml.js
flyout.js

工作空间渲染代码
inject.js
blockly.js
utils.js
toolbox.js
scrollbar.js
workspace.js

菜单拖动代码块
block.js
xml.js
connection.js
flyout.js

工作空间拖动代码
block_svg.js
block.js
workspace.js
utils.js
tooltip.js
contextmenu.js
field_dropdown.js
widgetdiv.js
toolbox.js
blockly.js


把代码块放到工作空间
block_svg.js
block.js
workspace.js
utils.js
blockly.js

把代码块拖到内嵌代码块
block.js
connection.js
block_svg.js

显示代码块
generator.js
workspace.js
block.js
block_svg.js
utils.js
index.html


运行代码块
generator.js
javascript.js
names.js
variable.js
workspace.js
block.js


切换菜单
block.js
xml.js
connection.js
flyout.js
field.js




类加载顺序
block_svg.js
blocks.js
scrollbar.js
trashcan.js
xml.js
workspace.js
bubble.js
icon.js
comment.js
connection.js
contextmenu.js
field.js
tooltip.js
field_label.js
input.js
msg.js
mutator.js
warning.js
block.js
field_textinput.js
field_angle.js
field_checkbox.js
generator.js
names.js
procedures.js
widgetdiv.js
inject.js
utils.js
blockly.js
logic.js = Blocks.logic
javascript.js
generators/javascript/logic.js=Blockly.JavaScript.logic
messages.js=Blockly.Msg.en




添加CSS样式
Blockly.Css.inject = function() {}


显示代码逻辑
block对象中获取3个blockly.input对象

从block.input对象获取block.connection对象

从block.connection对象获取Blockly.block对象
