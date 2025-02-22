/**
 * Visual Blocks Editor
 *
 * Copyright 2011 Google Inc.
 * http://blockly.googlecode.com/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview The class representing one block.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Blockly.Block');

goog.require('Blockly.BlockSvg');
goog.require('Blockly.Blocks');
goog.require('Blockly.Comment');
goog.require('Blockly.Connection');
goog.require('Blockly.ContextMenu');
goog.require('Blockly.Input');
goog.require('Blockly.Msg');
goog.require('Blockly.Mutator');
goog.require('Blockly.Warning');
goog.require('Blockly.Workspace');
goog.require('Blockly.Xml');
goog.require('goog.asserts');
goog.require('goog.string');
goog.require('goog.Timer');


/**
 * Unique ID counter for created blocks.
 * @private
 */
Blockly.uidCounter_ = 0;

/**
 * Class for one block.
 * @param {!Blockly.Workspace} workspace The new block's workspace.
 * @param {?string} prototypeName Name of the language object containing
 *     type-specific functions for this block.
 * @constructor
 */
Blockly.Block = function(workspace, prototypeName) {
  this.id = ++Blockly.uidCounter_;
  this.outputConnection = null;
  this.nextConnection = null;
  this.previousConnection = null;
  this.inputList = [];
  this.inputsInline = false;
  this.rendered = false;
  this.disabled = false;
  this.tooltip = '';
  this.contextMenu = true;

  this.parentBlock_ = null;
  this.childBlocks_ = [];
  this.deletable_ = true;
  this.movable_ = true;
  this.editable_ = true;
  this.collapsed_ = false;

  this.workspace = workspace;
  this.isInFlyout = workspace.isFlyout;

  workspace.addTopBlock(this);// 添加block到一个数组

  // Copy the type-specific functions and data from the prototype.
  if (prototypeName) {
    this.type = prototypeName;
    var prototype = Blockly.Blocks[prototypeName];
    goog.asserts.assertObject(prototype,
        'Error: "%s" is an unknown language block.', prototypeName);
    goog.mixin(this, prototype);
  }
  // Call an initialization function, if it exists.
  if (goog.isFunction(this.init)) {
    this.init();
  }
  // Bind an onchange function, if it exists.
  if (goog.isFunction(this.onchange)) {
    Blockly.bindEvent_(workspace.getCanvas(), 'blocklyWorkspaceChange', this,
                       this.onchange);
  }
};

/**
 * Pointer to SVG representation of the block.
 * @type {Blockly.BlockSvg}
 * @private
 */
Blockly.Block.prototype.svg_ = null;

/**
 * Block's mutator icon (if any).
 * @type {Blockly.Mutator}
 */
Blockly.Block.prototype.mutator = null;

/**
 * Block's comment icon (if any).
 * @type {Blockly.Comment}
 */
Blockly.Block.prototype.comment = null;

/**
 * Block's warning icon (if any).
 * @type {Blockly.Warning}
 */
Blockly.Block.prototype.warning = null;

/**
 * Returns a list of mutator, comment, and warning icons.
 * @return {!Array} List of icons.
 */
Blockly.Block.prototype.getIcons = function() {
  var icons = [];
  if (this.mutator) {
    icons.push(this.mutator);
  }
  if (this.comment) {
    icons.push(this.comment);
  }
  if (this.warning) {
    icons.push(this.warning);
  }
  return icons;
};

/**
 * Create and initialize the SVG representation of the block.
 */
Blockly.Block.prototype.initSvg = function() {
  this.svg_ = new Blockly.BlockSvg(this); // 创建一个BlockSvg元素对象
  this.svg_.init(); // 初始化Block SVG元素
  if (!Blockly.readOnly) {
    Blockly.bindEvent_(this.svg_.getRootElement(), 'mousedown', this,
                       this.onMouseDown_);// 绑定block 鼠标按下事件
  }
  this.workspace.getCanvas().appendChild(this.svg_.getRootElement()); // <g transform="translate(94,0)" 下增加g
};

/**
 * Return the root node of the SVG or null if none exists.
 * @return {Element} The root SVG node (probably a group).
 */
Blockly.Block.prototype.getSvgRoot = function() {
  return this.svg_ && this.svg_.getRootElement();
};

/**
 * Is the mouse dragging a block?
 * 0 - No drag operation.
 * 1 - Still inside the sticky DRAG_RADIUS.
 * 2 - Freely draggable.
 * @private
 */
Blockly.Block.dragMode_ = 0;

/**
 * Wrapper function called when a mouseUp occurs during a drag operation.
 * @type {Array.<!Array>}
 * @private
 */
Blockly.Block.onMouseUpWrapper_ = null;

/**
 * Wrapper function called when a mouseMove occurs during a drag operation.
 * @type {Array.<!Array>}
 * @private
 */
Blockly.Block.onMouseMoveWrapper_ = null;

/**
 * Stop binding to the global mouseup and mousemove events.
 * @private
 */
Blockly.Block.terminateDrag_ = function() {
  if (Blockly.Block.onMouseUpWrapper_) {
    Blockly.unbindEvent_(Blockly.Block.onMouseUpWrapper_);
    Blockly.Block.onMouseUpWrapper_ = null;
  }
  if (Blockly.Block.onMouseMoveWrapper_) {
    Blockly.unbindEvent_(Blockly.Block.onMouseMoveWrapper_);
    Blockly.Block.onMouseMoveWrapper_ = null;
  }
  var selected = Blockly.selected;
  if (Blockly.Block.dragMode_ == 2) {
    // Terminate a drag operation.
    if (selected) {
      // Update the connection locations.
      var xy = selected.getRelativeToSurfaceXY();
      var dx = xy.x - selected.startDragX;
      var dy = xy.y - selected.startDragY;
      selected.moveConnections_(dx, dy);
      delete selected.draggedBubbles_;
      selected.setDragging_(false);
      selected.render();
      goog.Timer.callOnce(
          selected.bumpNeighbours_, Blockly.BUMP_DELAY, selected);
      // Fire an event to allow scrollbars to resize.
      Blockly.fireUiEvent(window, 'resize');
    }
  }
  if (selected) {
    selected.workspace.fireChangeEvent();
  }
  Blockly.Block.dragMode_ = 0;
};

/**
 * Select this block.  Highlight it visually.
 */
Blockly.Block.prototype.select = function() {
  goog.asserts.assertObject(this.svg_, 'Block is not rendered.');
  if (Blockly.selected) {
    // Unselect any previously selected block.
    Blockly.selected.unselect();
  }
  Blockly.selected = this;
  this.svg_.addSelect();
  Blockly.fireUiEvent(this.workspace.getCanvas(), 'blocklySelectChange');
};

/**
 * Unselect this block.  Remove its highlighting.
 */
Blockly.Block.prototype.unselect = function() {
  goog.asserts.assertObject(this.svg_, 'Block is not rendered.');
  Blockly.selected = null;
  this.svg_.removeSelect();
  Blockly.fireUiEvent(this.workspace.getCanvas(), 'blocklySelectChange');
};

/**
 * Dispose of this block.
 * @param {boolean} healStack If true, then try to heal any gap by connecting
 *     the next statement with the previous statement.  Otherwise, dispose of
 *     all children of this block.
 * @param {boolean} animate If true, show a disposal animation and sound.
 */
Blockly.Block.prototype.dispose = function(healStack, animate) {
  // Switch off rerendering.
  this.rendered = false;
  this.unplug(healStack);

  if (animate && this.svg_) {
    this.svg_.disposeUiEffect();
  }

  //This block is now at the top of the workspace.
  // Remove this block from the workspace's list of top-most blocks.
  this.workspace.removeTopBlock(this);
  this.workspace = null;

  // Just deleting this block from the DOM would result in a memory leak as
  // well as corruption of the connection database.  Therefore we must
  // methodically step through the blocks and carefully disassemble them.

  if (Blockly.selected == this) {
    Blockly.selected = null;
    // If there's a drag in-progress, unlink the mouse events.
    Blockly.terminateDrag_();
  }

  // First, dispose of all my children.
  for (var x = this.childBlocks_.length - 1; x >= 0; x--) {
    this.childBlocks_[x].dispose(false);
  }
  // Then dispose of myself.
  var icons = this.getIcons();
  for (var x = 0; x < icons.length; x++) {
    icons[x].dispose();
  }
  // Dispose of all inputs and their titles.
  for (var x = 0, input; input = this.inputList[x]; x++) {
    input.dispose();
  }
  this.inputList = [];
  // Dispose of any remaining connections (next/previous/output).
  var connections = this.getConnections_(true);
  for (var x = 0; x < connections.length; x++) {
    var connection = connections[x];
    if (connection.targetConnection) {
      connection.disconnect();
    }
    connections[x].dispose();
  }
  // Dispose of the SVG and break circular references.
  if (this.svg_) {
    this.svg_.dispose();
    this.svg_ = null;
  }
};

/**
 * Unplug this block from its superior block.  If this block is a statement,
 * optionally reconnect the block underneath with the block on top.
 * @param {boolean} healStack Disconnect child statement and reconnect stack.
 * @param {boolean} bump Move the unplugged block sideways a short distance.
 */
Blockly.Block.prototype.unplug = function(healStack, bump) {
  bump = bump && !!this.getParent();
  if (this.outputConnection) {
    if (this.outputConnection.targetConnection) {
      // Disconnect from any superior block.
      this.setParent(null);
    }
  } else {
    var previousTarget = null;
    if (this.previousConnection && this.previousConnection.targetConnection) {
      // Remember the connection that any next statements need to connect to.
      previousTarget = this.previousConnection.targetConnection;
      // Detach this block from the parent's tree.
      this.setParent(null);
    }
    if (healStack && this.nextConnection &&
        this.nextConnection.targetConnection) {
      // Disconnect the next statement.
      var nextTarget = this.nextConnection.targetConnection;
      var nextBlock = this.nextConnection.targetBlock();
      nextBlock.setParent(null);
      if (previousTarget) {
        // Attach the next statement to the previous statement.
        previousTarget.connect(nextTarget);
      }
    }
  }
  if (bump) {
    // Bump the block sideways.
    var dx = Blockly.SNAP_RADIUS * (Blockly.RTL ? -1 : 1);
    var dy = Blockly.SNAP_RADIUS * 2;
    this.moveBy(dx, dy);
  }
};

/**
 * Return the coordinates of the top-left corner of this block relative to the
 * drawing surface's origin (0,0).
 * @return {!Object} Object with .x and .y properties.
 */
Blockly.Block.prototype.getRelativeToSurfaceXY = function() {
  var x = 0;
  var y = 0;
  if (this.svg_) {
    var element = this.svg_.getRootElement();
    do {
      // Loop through this block and every parent.
      var xy = Blockly.getRelativeXY_(element);
      x += xy.x;
      y += xy.y;
      element = element.parentNode;
    } while (element && element != this.workspace.getCanvas());
  }
  return {x: x, y: y};
};

/**
 * Move a block by a relative offset.
 * @param {number} dx Horizontal offset.
 * @param {number} dy Vertical offset.
 */
Blockly.Block.prototype.moveBy = function(dx, dy) {
  var xy = this.getRelativeToSurfaceXY();
  this.svg_.getRootElement().setAttribute('transform',
      'translate(' + (xy.x + dx) + ', ' + (xy.y + dy) + ')');
  this.moveConnections_(dx, dy);
};

/**
 * Returns a bounding box describing the dimensions of this block.
 * @return {!Object} Object with height and width properties.
 */
Blockly.Block.prototype.getHeightWidth = function() {
  try {
    var bBox = this.getSvgRoot().getBBox();
    var height = bBox.height;
  } catch (e) {
    // Firefox has trouble with hidden elements (Bug 528969).
    return {height: 0, width: 0};
  }
  if (Blockly.BROKEN_CONTROL_POINTS) {
    /* HACK:
     WebKit bug 67298 causes control points to be included in the reported
     bounding box.  The render functions (below) add two 5px spacer control
     points that we need to subtract.
    */
    height -= 10;
    if (this.nextConnection) {
      // Bottom control point partially masked by lower tab.
      height += 4;
    }
  }
  // Subtract one from the height due to the shadow.
  height -= 1;
  return {height: height, width: bBox.width};
};

/**
 * Handle a mouse-down on an SVG block.
 * @param {!Event} e Mouse down event.
 * @private
 */
Blockly.Block.prototype.onMouseDown_ = function(e) {
  if (this.isInFlyout) {
    return;
  }
  // Update Blockly's knowledge of its own location.
  Blockly.svgResize();
  Blockly.terminateDrag_();
  this.select();
  Blockly.hideChaff();
  if (Blockly.isRightButton(e)) {
    // Right-click.
    if (Blockly.ContextMenu) {
      this.showContextMenu_(Blockly.mouseToSvg(e));
    }
  } else if (!this.isMovable()) {
    // Allow unmovable blocks to be selected and context menued, but not
    // dragged.  Let this event bubble up to document, so the workspace may be
    // dragged instead.
    return;
  } else {
    // Left-click (or middle click)
    Blockly.removeAllRanges();
    Blockly.setCursorHand_(true);
    // Look up the current translation and record it.
    var xy = this.getRelativeToSurfaceXY();
    this.startDragX = xy.x;
    this.startDragY = xy.y;
    // Record the current mouse position.
    this.startDragMouseX = e.clientX;
    this.startDragMouseY = e.clientY;
    Blockly.Block.dragMode_ = 1;
    Blockly.Block.onMouseUpWrapper_ = Blockly.bindEvent_(document,
        'mouseup', this, this.onMouseUp_);
    Blockly.Block.onMouseMoveWrapper_ = Blockly.bindEvent_(document,
        'mousemove', this, this.onMouseMove_);
    // Build a list of bubbles that need to be moved and where they started.
    this.draggedBubbles_ = [];
    var descendants = this.getDescendants();
    for (var x = 0, descendant; descendant = descendants[x]; x++) {
      var icons = descendant.getIcons();
      for (var y = 0; y < icons.length; y++) {
        var data = icons[y].getIconLocation();
        data.bubble = icons[y];
        this.draggedBubbles_.push(data);
      }
    }
  }
  // This event has been handled.  No need to bubble up to the document.
  e.stopPropagation();
};

/**
 * Handle a mouse-up anywhere in the SVG pane.  Is only registered when a
 * block is clicked.  We can't use mouseUp on the block since a fast-moving
 * cursor can briefly escape the block before it catches up.
 * @param {!Event} e Mouse up event.
 * @private
 */
Blockly.Block.prototype.onMouseUp_ = function(e) {
  Blockly.terminateDrag_();
  if (Blockly.selected && Blockly.highlightedConnection_) {
    // Connect two blocks together.
    Blockly.localConnection_.connect(Blockly.highlightedConnection_);
    if (this.svg_) {
      // Trigger a connection animation.
      // Determine which connection is inferior (lower in the source stack).
      var inferiorConnection;
      if (Blockly.localConnection_.isSuperior()) {
        inferiorConnection = Blockly.highlightedConnection_;
      } else {
        inferiorConnection = Blockly.localConnection_;
      }
      inferiorConnection.sourceBlock_.svg_.connectionUiEffect();
    }
    if (this.workspace.trashcan && this.workspace.trashcan.isOpen) {
      // Don't throw an object in the trash can if it just got connected.
      this.workspace.trashcan.close();
    }
  } else if (this.workspace.trashcan && this.workspace.trashcan.isOpen) {
    var trashcan = this.workspace.trashcan;
    goog.Timer.callOnce(trashcan.close, 100, trashcan);
    Blockly.selected.dispose(false, true);
    // Dropping a block on the trash can will usually cause the workspace to
    // resize to contain the newly positioned block.  Force a second resize now
    // that the block has been deleted.
    Blockly.fireUiEvent(window, 'resize');
  }
  if (Blockly.highlightedConnection_) {
    Blockly.highlightedConnection_.unhighlight();
    Blockly.highlightedConnection_ = null;
  }
};

/**
 * Load the block's help page in a new window.
 * @private
 */
Blockly.Block.prototype.showHelp_ = function() {
  var url = goog.isFunction(this.helpUrl) ? this.helpUrl() : this.helpUrl;
  if (url) {
    window.open(url);
  }
};

/**
 * Duplicate this block and its children.
 * @return {!Blockly.Block} The duplicate.
 * @private
 */
Blockly.Block.prototype.duplicate_ = function() {
  // Create a duplicate via XML.
  var xmlBlock = Blockly.Xml.blockToDom_(this);
  Blockly.Xml.deleteNext(xmlBlock);
  var newBlock = Blockly.Xml.domToBlock_(
      /** @type {!Blockly.Workspace} */ (this.workspace), xmlBlock);
  // Move the duplicate next to the old block.
  var xy = this.getRelativeToSurfaceXY();
  if (Blockly.RTL) {
    xy.x -= Blockly.SNAP_RADIUS;
  } else {
    xy.x += Blockly.SNAP_RADIUS;
  }
  xy.y += Blockly.SNAP_RADIUS * 2;
  newBlock.moveBy(xy.x, xy.y);
  return newBlock;
};

/**
 * Show the context menu for this block.
 * @param {!Object} xy Coordinates of mouse click, contains x and y properties.
 * @private
 */
Blockly.Block.prototype.showContextMenu_ = function(xy) {
  if (Blockly.readOnly || !this.contextMenu) {
    return;
  }
  // Save the current block in a variable for use in closures.
  var block = this;
  var options = [];

  if (this.isDeletable() && !block.isInFlyout) {
    // Option to duplicate this block.
    var duplicateOption = {
      text: Blockly.Msg.DUPLICATE_BLOCK,
      enabled: true,
      callback: function() {
        block.duplicate_();
      }
    };
    if (this.getDescendants().length > this.workspace.remainingCapacity()) {
      duplicateOption.enabled = false;
    }
    options.push(duplicateOption);

    if (Blockly.Comment && !this.collapsed_) {
      // Option to add/remove a comment.
      var commentOption = {enabled: true};
      if (this.comment) {
        commentOption.text = Blockly.Msg.REMOVE_COMMENT;
        commentOption.callback = function() {
          block.setCommentText(null);
        };
      } else {
        commentOption.text = Blockly.Msg.ADD_COMMENT;
        commentOption.callback = function() {
          block.setCommentText('');
        };
      }
      options.push(commentOption);
    }

    // Option to make block inline.
    if (!this.collapsed_) {
      for (var i = 0; i < this.inputList.length; i++) {
        if (this.inputList[i].type == Blockly.INPUT_VALUE) {
          // Only display this option if there is a value input on the block.
          var inlineOption = {enabled: true};
          inlineOption.text = this.inputsInline ? Blockly.Msg.EXTERNAL_INPUTS :
                                                  Blockly.Msg.INLINE_INPUTS;
          inlineOption.callback = function() {
            block.setInputsInline(!block.inputsInline);
          };
          options.push(inlineOption);
          break;
        }
      }
    }

    if (Blockly.collapse) {
      // Option to collapse/expand block.
      if (this.collapsed_) {
        var expandOption = {enabled: true};
        expandOption.text = Blockly.Msg.EXPAND_BLOCK;
        expandOption.callback = function() {
          block.setCollapsed(false);
        };
        options.push(expandOption);
      } else {
        var collapseOption = {enabled: true};
        collapseOption.text = Blockly.Msg.COLLAPSE_BLOCK;
        collapseOption.callback = function() {
          block.setCollapsed(true);
        };
        options.push(collapseOption);
      }
    }

    // Option to disable/enable block.
    var disableOption = {
      text: this.disabled ?
          Blockly.Msg.ENABLE_BLOCK : Blockly.Msg.DISABLE_BLOCK,
      enabled: !this.getInheritedDisabled(),
      callback: function() {
        block.setDisabled(!block.disabled);
      }
    };
    options.push(disableOption);

    // Option to delete this block.
    // Count the number of blocks that are nested in this block.
    var descendantCount = this.getDescendants().length;
    if (block.nextConnection && block.nextConnection.targetConnection) {
      // Blocks in the current stack would survive this block's deletion.
      descendantCount -= this.nextConnection.targetBlock().
          getDescendants().length;
    }
    var deleteOption = {
      text: descendantCount == 1 ? Blockly.Msg.DELETE_BLOCK :
          Blockly.Msg.DELETE_X_BLOCKS.replace('%1', descendantCount),
      enabled: true,
      callback: function() {
        block.dispose(true, true);
      }
    };
    options.push(deleteOption);
  }

  // Option to get help.
  var url = goog.isFunction(this.helpUrl) ? this.helpUrl() : this.helpUrl;
  var helpOption = {enabled: !!url};
  helpOption.text = Blockly.Msg.HELP;
  helpOption.callback = function() {
    block.showHelp_();
  };
  options.push(helpOption);

  // Allow the block to add or modify options.
  if (this.customContextMenu && !block.isInFlyout) {
    this.customContextMenu(options);
  }

  Blockly.ContextMenu.show(xy, options);
};

/**
 * Returns all connections originating from this block.
 * @param {boolean} all If true, return all connections even hidden ones.
 *     Otherwise return those that are visible.
 * @return {!Array.<!Blockly.Connection>} Array of connections.
 * @private
 */
Blockly.Block.prototype.getConnections_ = function(all) {
  var myConnections = [];
  if (all || this.rendered) {
    if (this.outputConnection) {
      myConnections.push(this.outputConnection);
    }
    if (this.nextConnection) {
      myConnections.push(this.nextConnection);
    }
    if (this.previousConnection) {
      myConnections.push(this.previousConnection);
    }
    if (all || !this.collapsed_) {
      for (var x = 0, input; input = this.inputList[x]; x++) {
        if (input.connection) {
          myConnections.push(input.connection);
        }
      }
    }
  }
  return myConnections;
};

/**
 * Move the connections for this block and all blocks attached under it.
 * Also update any attached bubbles.
 * @param {number} dx Horizontal offset from current location.
 * @param {number} dy Vertical offset from current location.
 * @private
 */
Blockly.Block.prototype.moveConnections_ = function(dx, dy) {
  if (!this.rendered) {
    // Rendering is required to lay out the blocks.
    // This is probably an invisible block attached to a collapsed block.
    return;
  }
  var myConnections = this.getConnections_(false);
  for (var x = 0; x < myConnections.length; x++) {
    myConnections[x].moveBy(dx, dy);
  }
  var icons = this.getIcons();
  for (var x = 0; x < icons.length; x++) {
    icons[x].computeIconLocation();
  }

  // Recurse through all blocks attached under this one.
  for (var x = 0; x < this.childBlocks_.length; x++) {
    this.childBlocks_[x].moveConnections_(dx, dy);
  }
};

/**
 * Recursively adds or removes the dragging class to this node and its children.
 * @param {boolean} adding True if adding, false if removing.
 * @private
 */
Blockly.Block.prototype.setDragging_ = function(adding) {
  if (adding) {
    this.svg_.addDragging();
  } else {
    this.svg_.removeDragging();
  }
  // Recurse through all blocks attached under this one.
  for (var x = 0; x < this.childBlocks_.length; x++) {
    this.childBlocks_[x].setDragging_(adding);
  }
};

/**
 * Drag this block to follow the mouse.
 * @param {!Event} e Mouse move event.
 * @private
 */
Blockly.Block.prototype.onMouseMove_ = function(e) {
  if (e.type == 'mousemove' && e.clientX <= 1 && e.clientY == 0 &&
      e.button == 0) {
    /* HACK:
     Safari Mobile 6.0 and Chrome for Android 18.0 fire rogue mousemove events
     on certain touch actions. Ignore events with these signatures.
     This may result in a one-pixel blind spot in other browsers,
     but this shouldn't be noticable. */
    e.stopPropagation();
    return;
  }
  Blockly.removeAllRanges();
  var dx = e.clientX - this.startDragMouseX;
  var dy = e.clientY - this.startDragMouseY;
  if (Blockly.Block.dragMode_ == 1) {
    // Still dragging within the sticky DRAG_RADIUS.
    var dr = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
    if (dr > Blockly.DRAG_RADIUS) {
      // Switch to unrestricted dragging.
      Blockly.Block.dragMode_ = 2;
      // Push this block to the very top of the stack.
      this.setParent(null);
      this.setDragging_(true);
    }
  }
  if (Blockly.Block.dragMode_ == 2) {
    // Unrestricted dragging.
    var x = this.startDragX + dx;
    var y = this.startDragY + dy;
    this.svg_.getRootElement().setAttribute('transform',
        'translate(' + x + ', ' + y + ')');
    // Drag all the nested bubbles.
    for (var i = 0; i < this.draggedBubbles_.length; i++) {
      var commentData = this.draggedBubbles_[i];
      commentData.bubble.setIconLocation(commentData.x + dx,
                                         commentData.y + dy);
    }

    // Check to see if any of this block's connections are within range of
    // another block's connection.
    var myConnections = this.getConnections_(false);
    var closestConnection = null;
    var localConnection = null;
    var radiusConnection = Blockly.SNAP_RADIUS;
    for (var i = 0; i < myConnections.length; i++) {
      var myConnection = myConnections[i];
      var neighbour = myConnection.closest(radiusConnection, dx, dy);
      if (neighbour.connection) {
        closestConnection = neighbour.connection;
        localConnection = myConnection;
        radiusConnection = neighbour.radius;
      }
    }

    // Remove connection highlighting if needed.
    if (Blockly.highlightedConnection_ &&
        Blockly.highlightedConnection_ != closestConnection) {
      Blockly.highlightedConnection_.unhighlight();
      Blockly.highlightedConnection_ = null;
      Blockly.localConnection_ = null;
    }
    // Add connection highlighting if needed.
    if (closestConnection &&
        closestConnection != Blockly.highlightedConnection_) {
      closestConnection.highlight();
      Blockly.highlightedConnection_ = closestConnection;
      Blockly.localConnection_ = localConnection;
    }
    // Flip the trash can lid if needed.
    if (this.workspace.trashcan && this.isDeletable()) {
      this.workspace.trashcan.onMouseMove(e);
    }
  }
  // This event has been handled.  No need to bubble up to the document.
  e.stopPropagation();
};

/**
 * Bump unconnected blocks out of alignment.  Two blocks which aren't actually
 * connected should not coincidentally line up on screen.
 * @private
 */
Blockly.Block.prototype.bumpNeighbours_ = function() {
  if (Blockly.Block.dragMode_ != 0) {
    // Don't bump blocks during a drag.
    return;
  }
  var rootBlock = this.getRootBlock();
  if (rootBlock.isInFlyout) {
    // Don't move blocks around in a flyout.
    return;
  }
  // Loop though every connection on this block.
  var myConnections = this.getConnections_(false);
  for (var x = 0; x < myConnections.length; x++) {
    var connection = myConnections[x];
    // Spider down from this block bumping all sub-blocks.
    if (connection.targetConnection && connection.isSuperior()) {
      connection.targetBlock().bumpNeighbours_();
    }

    var neighbours = connection.neighbours_(Blockly.SNAP_RADIUS);
    for (var y = 0; y < neighbours.length; y++) {
      var otherConnection = neighbours[y];
      // If both connections are connected, that's probably fine.  But if
      // either one of them is unconnected, then there could be confusion.
      if (!connection.targetConnection || !otherConnection.targetConnection) {
        // Only bump blocks if they are from different tree structures.
        if (otherConnection.sourceBlock_.getRootBlock() != rootBlock) {
          // Always bump the inferior block.
          if (connection.isSuperior()) {
            otherConnection.bumpAwayFrom_(connection);
          } else {
            connection.bumpAwayFrom_(otherConnection);
          }
        }
      }
    }
  }
};

/**
 * Return the parent block or null if this block is at the top level.
 * @return {Blockly.Block} The block that holds the current block.
 */
Blockly.Block.prototype.getParent = function() {
  // Look at the DOM to see if we are nested in another block.
  return this.parentBlock_;
};

/**
 * Return the parent block that surrounds the current block, or null if this
 * block has no surrounding block.  A parent block might just be the previous
 * statement, whereas the surrounding block is an if statement, while loop, etc.
 * @return {Blockly.Block} The block that surrounds the current block.
 */
Blockly.Block.prototype.getSurroundParent = function() {
  var block = this;
  while (true) {
    do {
      var prevBlock = block;
      block = block.getParent();
      if (!block) {
        // Ran off the top.
        return null;
      }
    } while (block.nextConnection &&
             block.nextConnection.targetBlock() == prevBlock);
    // This block is an enclosing parent, not just a statement in a stack.
    return block;
  }
};

/**
 * Return the top-most block in this block's tree.
 * This will return itself if this block is at the top level.
 * @return {!Blockly.Block} The root block.
 */
Blockly.Block.prototype.getRootBlock = function() {
  var rootBlock;
  var block = this;
  do {
    rootBlock = block;
    block = rootBlock.parentBlock_;
  } while (block);
  return rootBlock;
};

/**
 * Find all the blocks that are directly nested inside this one.
 * Includes value and block inputs, as well as any following statement.
 * Excludes any connection on an output tab or any preceding statement.
 * @return {!Array.<!Blockly.Block>} Array of blocks.
 */
Blockly.Block.prototype.getChildren = function() {
  return this.childBlocks_;
};

/**
 * Set parent of this block to be a new block or null.
 * @param {Blockly.Block} newParent New parent block.
 */
Blockly.Block.prototype.setParent = function(newParent) {
  if (this.parentBlock_) {
    // Remove this block from the old parent's child list.
    var children = this.parentBlock_.childBlocks_;
    for (var child, x = 0; child = children[x]; x++) {
      if (child == this) {
        children.splice(x, 1);
        break;
      }
    }
    // Move this block up the DOM.  Keep track of x/y translations.
    var xy = this.getRelativeToSurfaceXY();
    this.workspace.getCanvas().appendChild(this.svg_.getRootElement());
    this.svg_.getRootElement().setAttribute('transform',
        'translate(' + xy.x + ', ' + xy.y + ')');

    // Disconnect from superior blocks.
    this.parentBlock_ = null;
    if (this.previousConnection && this.previousConnection.targetConnection) {
      this.previousConnection.disconnect();
    }
    if (this.outputConnection && this.outputConnection.targetConnection) {
      this.outputConnection.disconnect();
    }
    // This block hasn't actually moved on-screen, so there's no need to update
    // its connection locations.
  } else {
    // Remove this block from the workspace's list of top-most blocks.
    this.workspace.removeTopBlock(this);
  }

  this.parentBlock_ = newParent;
  if (newParent) {
    // Add this block to the new parent's child list.
    newParent.childBlocks_.push(this);

    var oldXY = this.getRelativeToSurfaceXY();
    if (newParent.svg_ && this.svg_) {
      newParent.svg_.getRootElement().appendChild(this.svg_.getRootElement());
    }
    var newXY = this.getRelativeToSurfaceXY();
    // Move the connections to match the child's new position.
    this.moveConnections_(newXY.x - oldXY.x, newXY.y - oldXY.y);
  } else {
    this.workspace.addTopBlock(this);
  }
};

/**
 * Find all the blocks that are directly or indirectly nested inside this one.
 * Includes this block in the list.
 * Includes value and block inputs, as well as any following statements.
 * Excludes any connection on an output tab or any preceding statements.
 * @return {!Array.<!Blockly.Block>} Flattened array of blocks.
 */
Blockly.Block.prototype.getDescendants = function() {
  var blocks = [this];
  for (var child, x = 0; child = this.childBlocks_[x]; x++) {
    blocks = blocks.concat(child.getDescendants());
  }
  return blocks;
};

/**
 * Get whether this block is deletable or not.
 * @return {boolean} True if deletable.
 */
Blockly.Block.prototype.isDeletable = function() {
  return this.deletable_ && !Blockly.readOnly;
};

/**
 * Set whether this block is deletable or not.
 * @param {boolean} deletable True if deletable.
 */
Blockly.Block.prototype.setDeletable = function(deletable) {
  this.deletable_ = deletable;
  this.svg_ && this.svg_.updateMovable();
};

/**
 * Get whether this block is movable or not.
 * @return {boolean} True if movable.
 */
Blockly.Block.prototype.isMovable = function() {
  return this.movable_ && !Blockly.readOnly;
};

/**
 * Set whether this block is movable or not.
 * @param {boolean} movable True if movable.
 */
Blockly.Block.prototype.setMovable = function(movable) {
  this.movable_ = movable;
};

/**
 * Get whether this block is editable or not.
 * @return {boolean} True if editable.
 */
Blockly.Block.prototype.isEditable = function() {
  return this.editable_ && !Blockly.readOnly;
};

/**
 * Set whether this block is editable or not.
 * @param {boolean} editable True if editable.
 */
Blockly.Block.prototype.setEditable = function(editable) {
  this.editable_ = editable;
  for (var x = 0, input; input = this.inputList[x]; x++) {
    for (var y = 0, title; title = input.titleRow[y]; y++) {
      title.updateEditable();
    }
  }
  var icons = this.getIcons();
  for (var x = 0; x < icons.length; x++) {
    icons[x].updateEditable();
  }
};

/**
 * Set the URL of this block's help page.
 * @param {string|Function} url URL string for block help, or function that
 *     returns a URL.  Null for no help.
 */
Blockly.Block.prototype.setHelpUrl = function(url) {
  this.helpUrl = url;
};

/**
 * Get the colour of a block.
 * @return {number} HSV hue value.
 */
Blockly.Block.prototype.getColour = function() {
  return this.colourHue_;
};

/**
 * Change the colour of a block.
 * @param {number} colourHue HSV hue value.
 */
Blockly.Block.prototype.setColour = function(colourHue) {
  this.colourHue_ = colourHue;
  if (this.svg_) {
    this.svg_.updateColour();
  }
  var icons = this.getIcons();
  for (var x = 0; x < icons.length; x++) {
    icons[x].updateColour();
  }
  if (this.rendered) {
    // Bump every dropdown to change its colour.
    for (var x = 0, input; input = this.inputList[x]; x++) {
      for (var y = 0, title; title = input.titleRow[y]; y++) {
        title.setText(null);
      }
    }
    this.render();
  }
};

/**
 * Returns the named title from a block.
 * @param {string} name The name of the title.
 * @return {Blockly.Field} Named title, or null if title does not exist.
 * @private
 */
Blockly.Block.prototype.getTitle_ = function(name) {
  for (var x = 0, input; input = this.inputList[x]; x++) {
    for (var y = 0, title; title = input.titleRow[y]; y++) {
      if (title.name === name) {
        return title;
      }
    }
  }
  return null;
};

/**
 * Returns the language-neutral value from the title of a block.
 * @param {string} name The name of the title.
 * @return {?string} Value from the title or null if title does not exist.
 */
Blockly.Block.prototype.getTitleValue = function(name) {
  var title = this.getTitle_(name);
  if (title) {
    return title.getValue();
  }
  return null;
};

/**
 * Change the title value for a block (e.g. 'CHOOSE' or 'REMOVE').
 * @param {string} newValue Value to be the new title.
 * @param {string} name The name of the title.
 */
Blockly.Block.prototype.setTitleValue = function(newValue, name) {
  var title = this.getTitle_(name);
  goog.asserts.assertObject(title, 'Title "%s" not found.', name);
  title.setValue(newValue);
};

/**
 * Change the tooltip text for a block.
 * @param {string|!Element} newTip Text for tooltip or a parent element to
 *     link to for its tooltip.
 */
Blockly.Block.prototype.setTooltip = function(newTip) {
  this.tooltip = newTip;
};

/**
 * Set whether this block can chain onto the bottom of another block.
 * @param {boolean} newBoolean True if there can be a previous statement.
 * @param {string|Array.<string>|null} opt_check Statement type or list of
 *     statement types.  Null or undefined if any type could be connected.
 */
Blockly.Block.prototype.setPreviousStatement = function(newBoolean, opt_check) {
  if (this.previousConnection) {
    goog.asserts.assert(!this.previousConnection.targetConnection,
        'Must disconnect previous statement before removing connection.');
    this.previousConnection.dispose();
    this.previousConnection = null;
  }
  if (newBoolean) {
    goog.asserts.assert(!this.outputConnection,
        'Remove output connection prior to adding previous connection.');
    if (opt_check === undefined) {
      opt_check = null;
    }
    this.previousConnection =
        new Blockly.Connection(this, Blockly.PREVIOUS_STATEMENT);
    this.previousConnection.setCheck(opt_check);
  }
  if (this.rendered) {
    this.render();
    this.bumpNeighbours_();
  }
};

/**
 * Set whether another block can chain onto the bottom of this block.
 * @param {boolean} newBoolean True if there can be a next statement.
 * @param {string|Array.<string>|null} opt_check Statement type or list of
 *     statement types.  Null or undefined if any type could be connected.
 */
Blockly.Block.prototype.setNextStatement = function(newBoolean, opt_check) {
  if (this.nextConnection) {
    goog.asserts.assert(!this.nextConnection.targetConnection,
        'Must disconnect next statement before removing connection.');
    this.nextConnection.dispose();
    this.nextConnection = null;
  }
  if (newBoolean) {
    if (opt_check === undefined) {
      opt_check = null;
    }
    this.nextConnection =
        new Blockly.Connection(this, Blockly.NEXT_STATEMENT);
    this.nextConnection.setCheck(opt_check);
  }
  if (this.rendered) {
    this.render();
    this.bumpNeighbours_();
  }
};

/**
 * Set whether this block returns a value.
 * @param {boolean} newBoolean True if there is an output.
 * @param {string|Array.<string>|null} opt_check Returned type or list of
 *     returned types.  Null or undefined if any type could be returned
 *     (e.g. variable get).
 */
Blockly.Block.prototype.setOutput = function(newBoolean, opt_check) {
  if (this.outputConnection) {
    goog.asserts.assert(!this.outputConnection.targetConnection,
        'Must disconnect output value before removing connection.');
    this.outputConnection.dispose();
    this.outputConnection = null;
  }
  if (newBoolean) {
    goog.asserts.assert(!this.previousConnection,
        'Remove previous connection prior to adding output connection.');
    if (opt_check === undefined) {
      opt_check = null;
    }
    this.outputConnection =
        new Blockly.Connection(this, Blockly.OUTPUT_VALUE);
    this.outputConnection.setCheck(opt_check);
  }
  if (this.rendered) {
    this.render();
    this.bumpNeighbours_();
  }
};

/**
 * Set whether value inputs are arranged horizontally or vertically.
 * @param {boolean} newBoolean True if inputs are horizontal.
 */
Blockly.Block.prototype.setInputsInline = function(newBoolean) {
  this.inputsInline = newBoolean;
  if (this.rendered) {
    this.render();
    this.bumpNeighbours_();
    this.workspace.fireChangeEvent();
  }
};

/**
 * Set whether the block is disabled or not.
 * @param {boolean} disabled True if disabled.
 */
Blockly.Block.prototype.setDisabled = function(disabled) {
  if (this.disabled == disabled) {
    return;
  }
  this.disabled = disabled;
  this.svg_.updateDisabled();
  this.workspace.fireChangeEvent();
};

/**
 * Get whether the block is disabled or not due to parents.
 * The block's own disabled property is not considered.
 * @return {boolean} True if disabled.
 */
Blockly.Block.prototype.getInheritedDisabled = function() {
  var block = this;
  while (true) {
    block = block.getSurroundParent();
    if (!block) {
      // Ran off the top.
      return false;
    } else if (block.disabled) {
      return true;
    }
  }
};

/**
 * Get whether the block is collapsed or not.
 * @return {boolean} True if collapsed.
 */
Blockly.Block.prototype.isCollapsed = function() {
  return this.collapsed_;
};

/**
 * Set whether the block is collapsed or not.
 * @param {boolean} collapsed True if collapsed.
 */
Blockly.Block.prototype.setCollapsed = function(collapsed) {
  if (this.collapsed_ == collapsed) {
    return;
  }
  this.collapsed_ = collapsed;
  var renderList = [];
  // Show/hide the inputs.
  for (var x = 0, input; input = this.inputList[x]; x++) {
    renderList = renderList.concat(input.setVisible(!collapsed));
  }

  var COLLAPSED_INPUT_NAME = '_TEMP_COLLAPSED_INPUT';
  if (collapsed) {
    var icons = this.getIcons();
    for (var x = 0; x < icons.length; x++) {
      icons[x].setVisible(false);
    }
    var text = this.toString(Blockly.COLLAPSE_CHARS);
    this.appendDummyInput(COLLAPSED_INPUT_NAME).appendTitle(text);
  } else {
    this.removeInput(COLLAPSED_INPUT_NAME)
  }

  if (!renderList.length) {
    // No child blocks, just render this block.
    renderList[0] = this;
  }
  if (this.rendered) {
    for (var x = 0, block; block = renderList[x]; x++) {
      block.render();
    }
    this.bumpNeighbours_();
  }
};

/**
 * Create a human-readable text representation of this block and any children.
 * @param {?number} opt_maxLength Truncate the string to this length.
 * @return {string} Text of block.
 */
Blockly.Block.prototype.toString = function(opt_maxLength) {
  var text = [];
  for (var x = 0, input; input = this.inputList[x]; x++) {
    for (var y = 0, title; title = input.titleRow[y]; y++) {
      text.push(title.getText());
    }
    if (input.connection) {
      var child = input.connection.targetBlock();
      if (child) {
        text.push(child.toString());
      } else {
        text.push('?');
      }
    }
  }
  text = goog.string.trim(text.join(' ')) || '???';
  if (opt_maxLength) {
    // TODO: Improve truncation so that text from this block is given priority.
    // TODO: Handle FieldImage better.
    text = goog.string.truncate(text, opt_maxLength);
  }
  return text;
}

/**
 * Shortcut for appending a value input row.
 * @param {string} name Language-neutral identifier which may used to find this
 *     input again.  Should be unique to this block.
 * @return {!Blockly.Input} The input object created.
 */
Blockly.Block.prototype.appendValueInput = function(name) {
  return this.appendInput_(Blockly.INPUT_VALUE, name);
};

/**
 * Shortcut for appending a statement input row.
 * @param {string} name Language-neutral identifier which may used to find this
 *     input again.  Should be unique to this block.
 * @return {!Blockly.Input} The input object created.
 */
Blockly.Block.prototype.appendStatementInput = function(name) {
  return this.appendInput_(Blockly.NEXT_STATEMENT, name);
};

/**
 * Shortcut for appending a dummy input row.
 * @param {string} opt_name Language-neutral identifier which may used to find
 *     this input again.  Should be unique to this block.
 * @return {!Blockly.Input} The input object created.
 */
Blockly.Block.prototype.appendDummyInput = function(opt_name) {
  return this.appendInput_(Blockly.DUMMY_INPUT, opt_name || '');
};

/**
 * Interpolate a message string, creating titles and inputs.
 * @param {string} msg The message string to parse.  %1, %2, etc. are symbols
 *     for value inputs.
 * @param {!Array.<string|number>|number} var_args A series of tuples that
 *     each specify the value inputs to create.  Each tuple has three values:
 *     the input name, its check type, and its title's alignment.  The last
 *     parameter is not a tuple, but just an alignment for any trailing dummy
 *     input.  This last parameter is mandatory; there may be any number of
 *     tuples (though the number of tuples must match the symbols in msg).
 */
Blockly.Block.prototype.interpolateMsg = function(msg, var_args) {
  // Remove the msg from the start and the dummy alignment from the end of args.
  goog.asserts.assertString(msg);
  var dummyAlign = arguments.length - 1;
  goog.asserts.assertNumber(dummyAlign);

  var tokens = msg.split(/(%\d)/);
  for (var i = 0; i < tokens.length; i += 2) {
    var text = goog.string.trim(tokens[i]);
    var symbol = tokens[i + 1];
    if (symbol) {
      // Value input.
      var digit = parseInt(symbol.charAt(1), 10);
      var tuple = arguments[digit];
      goog.asserts.assertArray(tuple,
          'Message symbol "%s" is out of range.', symbol);
      this.appendValueInput(tuple[0])
          .setCheck(tuple[1])
          .setAlign(tuple[2])
          .appendTitle(text);
      arguments[digit] = null;  // Inputs may not be reused.
    } else if (text) {
      // Trailing dummy input.
      this.appendDummyInput()
          .setAlign(dummyAlign)
          .appendTitle(text);
    }
  }
  // Verify that all inputs were used.
  for (var i = 1; i < arguments.length - 1; i++) {
    goog.asserts.assert(arguments[i] === null,
        'Input "%%s" not used in message: "%s"', i, msg);
  }
  // Make the inputs inline unless there is only one input and
  // no text follows it.
  this.setInputsInline(!msg.match(/%1\s*$/))
};

/**
 * Add a value input, statement input or local variable to this block.
 * @param {number} type Either Blockly.INPUT_VALUE or Blockly.NEXT_STATEMENT or
 *     Blockly.DUMMY_INPUT.
 * @param {string} name Language-neutral identifier which may used to find this
 *     input again.  Should be unique to this block.
 * @return {!Blockly.Input} The input object created.
 * @private
 */
Blockly.Block.prototype.appendInput_ = function(type, name) {
  var connection = null;
  if (type == Blockly.INPUT_VALUE || type == Blockly.NEXT_STATEMENT) {
    connection = new Blockly.Connection(this, type);
  }
  var input = new Blockly.Input(type, name, this, connection);
  // Append input to list.
  this.inputList.push(input);
  if (this.rendered) {
    this.render();
    // Adding an input will cause the block to change shape.
    this.bumpNeighbours_();
  }
  return input;
};

/**
 * Move an input to a different location on this block.
 * @param {string} name The name of the input to move.
 * @param {string} refName Name of input that should be after the moved input,
 *   or null to be the input at the end.
 */
Blockly.Block.prototype.moveInputBefore = function(name, refName) {
  goog.asserts.assert(name != refName, 'Can\'t move "%s" to itself.', name);
  // Find both inputs.
  var inputIndex = -1;
  var refIndex = refName ? -1 : this.inputList.length;
  for (var x = 0, input; input = this.inputList[x]; x++) {
    if (input.name == name) {
      inputIndex = x;
      if (refIndex != -1) {
        break;
      }
    } else if (refName && input.name == refName) {
      refIndex = x;
      if (inputIndex != -1) {
        break;
      }
    }
  }
  goog.asserts.assert(inputIndex != -1, 'Named input "%s" not found.', name);
  goog.asserts.assert(refIndex && refIndex != -1,
                      'Reference input "%s" not found.', refName);
  // Remove input.
  this.inputList.splice(inputIndex, 1);
  if (inputIndex < refIndex) {
    refIndex--;
  }
  // Reinsert input.
  this.inputList.splice(refIndex, 0, input);
  if (this.rendered) {
    this.render();
    // Moving an input will cause the block to change shape.
    this.bumpNeighbours_();
  }
};

/**
 * Remove an input from this block.
 * @param {string} name The name of the input.
 * @param {boolean} opt_quiet True to prevent error if input is not present.
 * @throws {goog.asserts.AssertionError} if the input is not present and
 *     opt_quiet is not true.
 */
Blockly.Block.prototype.removeInput = function(name, opt_quiet) {
  for (var x = 0, input; input = this.inputList[x]; x++) {
    if (input.name == name) {
      if (input.connection && input.connection.targetConnection) {
        // Disconnect any attached block.
        input.connection.targetBlock().setParent(null);
      }
      input.dispose();
      this.inputList.splice(x, 1);
      if (this.rendered) {
        this.render();
        // Removing an input will cause the block to change shape.
        this.bumpNeighbours_();
      }
      return;
    }
  }
  if (!opt_quiet) {
    goog.asserts.fail('Input "%s" not found.', name);
  }
};

/**
 * Fetches the named input object.
 * @param {string} name The name of the input.
 * @return {Object} The input object, or null of the input does not exist.
 */
Blockly.Block.prototype.getInput = function(name) {
  for (var x = 0, input; input = this.inputList[x]; x++) {
    if (input.name == name) {
      return input;
    }
  }
  // This input does not exist.
  return null;
};

/**
 * Fetches the block attached to the named input.
 * @param {string} name The name of the input.
 * @return {Blockly.Block} The attached value block, or null if the input is
 *     either disconnected or if the input does not exist.
 */
Blockly.Block.prototype.getInputTargetBlock = function(name) {
  var input = this.getInput(name);
  return input && input.connection && input.connection.targetBlock();
};

/**
 * Give this block a mutator dialog.
 * @param {Blockly.Mutator} mutator A mutator dialog instance or null to remove.
 */
Blockly.Block.prototype.setMutator = function(mutator) {
  if (this.mutator && this.mutator !== mutator) {
    this.mutator.dispose();
  }
  if (mutator) {
    mutator.block_ = this;
    this.mutator = mutator;
    if (this.svg_) {
      mutator.createIcon();
    }
  }
};

/**
 * Returns the comment on this block (or '' if none).
 * @return {string} Block's comment.
 */
Blockly.Block.prototype.getCommentText = function() {
  if (this.comment) {
    var comment = this.comment.getText();
    // Trim off trailing whitespace.
    return comment.replace(/\s+$/, '').replace(/ +\n/g, '\n');
  }
  return '';
};

/**
 * Set this block's comment text.
 * @param {?string} text The text, or null to delete.
 */
Blockly.Block.prototype.setCommentText = function(text) {
  var changedState = false;
  if (goog.isString(text)) {
    if (!this.comment) {
      this.comment = new Blockly.Comment(this);
      changedState = true;
    }
    this.comment.setText(/** @type {string} */ (text));
  } else {
    if (this.comment) {
      this.comment.dispose();
      changedState = true;
    }
  }
  if (this.rendered) {
    this.render();
    if (changedState) {
      // Adding or removing a comment icon will cause the block to change shape.
      this.bumpNeighbours_();
    }
  }
};

/**
 * Set this block's warning text.
 * @param {?string} text The text, or null to delete.
 */
Blockly.Block.prototype.setWarningText = function(text) {
  if (this.isInFlyout) {
    text = null;
  }
  var changedState = false;
  if (goog.isString(text)) {
    if (!this.warning) {
      this.warning = new Blockly.Warning(this);
      changedState = true;
    }
    this.warning.setText(/** @type {string} */ (text));
  } else {
    if (this.warning) {
      this.warning.dispose();
      changedState = true;
    }
  }
  if (changedState && this.rendered) {
    this.render();
    // Adding or removing a warning icon will cause the block to change shape.
    this.bumpNeighbours_();
  }
};

/**
 * Render the block.
 * Lays out and reflows a block based on its contents and settings.
 */
Blockly.Block.prototype.render = function() {
  goog.asserts.assertObject(this.svg_,
      'Uninitialized block cannot be rendered.  Call block.initSvg()');
  this.svg_.render();
};
