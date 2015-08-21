/*

Behaviour
=========

- Escape key:
  * removes beacon (but does not deactivate)
  * cancels action if we're currently "acting"

- Space key:
  * runs primary action if hasPrimary is true

- Return key:
  * does nothing if manualReturn = true
  * if control is a descendent of a <form>, submits form
  * otherwise, runs primary action if hasPrimary is true

- All controls need to have a single "target" element, e.g.
    input, anchor, button, textarea, etc.
  This is where we place callbacks, `tabindex`, `disabled`, etc.
  Controls may have other elements which can accept input, but these have no
  tabindex, and users of the control cannot pass properties to them

- All controls should define their own way of passing out a value to the outside
  world, e.g. onClick, onInput, etc. In the case that controlPrimaryAction exists,
  this should be where it happens.


State
=====

- active: currently accepting input
  * corresponds to browser "focus"
- beacon: draw attention to input
  * turned on when the element is made active via keyboard (i.e. via tabbing)
  * turned off when element is inactivated or `selecting` goes from false -> true
  * temporarily turned off while "acting" is true
- selecting: user is selecting the input via mouse/touch
  * cannot become true when control is disabled
  * invariant: control is active when selecting goes from true -> false except if disabled
- acting: user is indicating that they'd like to carry out the primary action
  * bound to the space key unless `manualSpace` is true or `actionless` is true
  * bound to the return key if not a child of a <form> element, unless `maunalReturn`
    or `actionless` is true
  * triggered selection if `actOnSelect` is true
  * cannot become true when control is disabled
  * `Base.on 'action'` callback will be called when `acting` goes from true -> false
  * startActing/finishActing/cancelActing can be manually called by inheriting class
- disabled: element cannot be selecting/acting
  * cannot be applied (but element can become active/show a beacon)

*/


import React, {Component, PropTypes} from "react"
import base from "react-base"
import invariant from "invariant"


const beaconWasEnabled = Symbol()

const setControl = Symbol()
const start = Symbol()
const finish = Symbol()
const oldBase = Symbol()


const controlStateShape =
  PropTypes.shape({
    active: PropTypes.bool,
    beacon: PropTypes.bool,
    hover: PropTypes.bool,
    acting: PropTypes.bool,
    selecting: PropTypes.oneOfType([PropTypes.object, PropTypes.bool]),
    disabled: PropTypes.bool,
  }).isRequired


const KeyCodes = {
  ESC: 27,
  ENTER: 13,
  SPACE: 32,
  TAB: 9,
}

const InputCallbacks = [
  'blur',
  'focus',
  'keyDown',
  'keyUp',
]


// We only need to know if *tab* is pressed, not *where* it was pressed - so
// set up a variable which all controls can reference.
let tabPressed = false
if (window.addEventListener) {
  window.addEventListener('keydown', e => {
    if (e.keyCode == KeyCodes.TAB) {
      tabPressed = true
    }
  })
  window.addEventListener('keyup', e => {
    tabPressed = false
  })
}


baseControl.on = base.on
export default function baseControl(prefix, {passthrough = {}, manualReturn} = {}) {
  return function decorator(component) {

    //
    // Sanity checking, modify component configuration
    //

    invariant(component.prototype.control === undefined,
      "@baseControl must be applied to a component with no `control` property")

    if (!component.propTypes) component.propTypes = {}
    if (!component.contextTypes) component.contextTypes = {}

    invariant(component.propTypes.onControl === undefined,
      "@baseControl must be applied to a component with no `onControl` propType")

    invariant(component.contextTypes.controlState === undefined,
      "@baseControl must be applied to a component with no `controlState` contextType")
    invariant(component.contextTypes.setControlState === undefined,
      "@baseControl must be applied to a component with no `setControlState` contextType")

    component.propTypes.onControl = PropTypes.func

    // TODO: These should only ever be used internally, so it would make sense,
    // to define them as symbols instead of strings. However, React doesn't
    // currently seem to support this.
    component.contextTypes.controlState = controlStateShape
    component.contextTypes.setControlState = PropTypes.func


    //
    // Apply `base`, modifying it's settings to suit us
    //

    if (!passthrough.force) passthrough.force = []
    passthrough.force.push('disabled', 'tabindex', 'form')

    if (!passthrough.skip) passthrough.skip = []
    passthrough.skip.push('onControl')

    base(prefix, {passthrough})(component)

    //
    // Setup our internal methods
    //

    component.prototype.targetCallbacks = function() {
      const callbacks = Object.assign({}, this.callbacks)
      for (let event of InputCallbacks) {
        delete callbacks[event]
      }
      return callbacks
    }

    component.prototype.focusableCallbacks = function() {
      const callbacks = {}
      for (let event of InputCallbacks) {
        callbacks[event] = this.callbacks[event]
      }
      return callbacks
    }

    component.prototype[setControl] = function(control) {
      if (this.controlWillUpdate) {
        this.controlWillUpdate(control)
      }
      

      this.context.setControlState(control)

      if (this.props.onControl) {
        this.props.onControl(this.context.controlState)
      }
    }

    component.prototype[start] = function(e) {
      if (!this.control.disabled) {
        const point = e && {
          x: e.pageX === undefined ? e.nativeEvent.pageX : e.pageX,
          y: e.pageY === undefined ? e.nativeEvent.pageY : e.pageY,
        }

        // Use null instead of false for the beacon, so we can tell if it is
        // disabled by blur/pointer/escape key before keyup
        this[setControl]({
          acting: !!this.controlPrimaryAction,
          beacon: !point && (this.control.beacon || this.control.beacon === null) ? null : false,
          selecting: point,
        })
      }
    }

    component.prototype[finish] = function(e) {
      if (this.control.acting == true && this.controlPrimaryAction) {
        this.controlPrimaryAction(e)
      }

      this[setControl]({
        acting: false,
        beacon: this.control.beacon || this.control.beacon === null,
        selecting: false,
      })
    }


    //
    // Define event handlers (using react-callback-register)
    //

    component.on('keyDown', function(e) {
      switch (e.keyCode) {
        case KeyCodes.ENTER:
          // TODO: if we're a child of a form, submit it and break -
          // otherwise fall through
        case KeyCodes.SPACE:
          this[start]()
          break

        case KeyCodes.ESC:
          this[setControl]({
            beacon: false,
            selecting: false,
            acting: false,
          })
          break
      }
    })

    component.on('keyUp', function(e) {
      switch (e.keyCode) {
        case KeyCodes.ENTER:
          // TODO: if we're a child of a form, submit it and break -
          // otherwise fall through
        case KeyCodes.SPACE:
          this[finish](e)
          break
      }
    })

    component.on('mouseEnter', function(e) {
      this[setControl]({hover: true})
    })

    component.on('mouseLeave', function(e) {
      this[setControl]({hover: false})
      this[finish](e)
    })

    component.on(['mouseDown', 'touchStart'], function(e) {
      if (e.button === 0 || e.button === undefined) {
        this[start](e)
      }
    })

    component.on(['mouseUp', 'mouseOut', 'touchEnd'], function(e) {
      this[finish](e)
    })

    component.on('blur', function(e) {
      this[setControl]({beacon: false, active: false})
    })

    component.on('focus', function(e) {
      if (tabPressed) {
        this[setControl]({beacon: true})
      }
      this[setControl]({active: true})
    })


    //
    // Define API for applied component
    //

    Object.defineProperty(component.prototype, 'control', {
      get: function() {
        return this.context.controlState
      },
      enumerable: true,
    })


    //
    // Create wrapper component to hide our component state via context
    //

    return class Control extends Component {
      static propTypes = {
        disabled: PropTypes.bool,
      }

      static childContextTypes = {
        controlState: controlStateShape,
        setControlState: PropTypes.func,
      }

      state = {
        active: false,
        beacon: false,
        hover: false,
        acting: false,
        selecting: null,
        disabled: !!this.props.disabled,
      }
      
      getChildContext() {
        return {
          controlState: this.state,
          setControlState: this.setState.bind(this),
        }
      }

      render() {
        return React.createElement(component, this.props, this.props.children)
      }
    }
  }
}
